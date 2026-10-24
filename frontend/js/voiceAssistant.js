const API_BASE_URL = ['127.0.0.1','localhost'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : '/api';

class MarathiVoiceAssistant {
  constructor() {
    this.recognition = null;
    this.audio = null;
    this.isOpen = false;
  }

  init() {
    document.body.insertAdjacentHTML('beforeend', `
      <button class="voice-assistant-fab" id="voice-assistant-fab" aria-label="मराठी आवाज सहाय्यक उघडा" title="मराठी आवाज सहाय्यक">
        <i data-lucide="mic"></i><span>मराठी</span>
      </button>
      <section class="voice-assistant-panel" id="voice-assistant-panel" aria-live="polite" hidden>
        <div class="voice-assistant-header">
          <div><strong>रेमिंट मराठी सहाय्यक</strong><small>ElevenLabs आवाज</small></div>
          <button id="voice-assistant-close" aria-label="बंद करा">×</button>
        </div>
        <div class="voice-assistant-message" id="voice-assistant-message">नमस्कार! कचरा नोंदवण्यासाठी किंवा माहिती मिळवण्यासाठी मला मराठीत विचारा.</div>
        <div class="voice-assistant-actions">
          <button class="voice-listen-btn" id="voice-listen-btn"><i data-lucide="mic"></i><span>बोलायला सुरुवात करा</span></button>
          <input id="voice-text-input" lang="mr" placeholder="मराठीत प्रश्न लिहा..." maxlength="300">
          <button id="voice-send-btn" aria-label="पाठवा"><i data-lucide="send"></i></button>
        </div>
        <div class="voice-assistant-hints">उदा. “कचरा नोंदवा”, “माझी बक्षिसे दाखवा”, “पिकअप कुठे आहे?”</div>
      </section>`);
    document.getElementById('voice-assistant-fab').addEventListener('click', () => this.toggle());
    document.getElementById('voice-assistant-close').addEventListener('click', () => this.toggle(false));
    document.getElementById('voice-listen-btn').addEventListener('click', () => this.listen());
    document.getElementById('voice-send-btn').addEventListener('click', () => this.submitTyped());
    document.getElementById('voice-text-input').addEventListener('keydown', event => {
      if (event.key === 'Enter') this.submitTyped();
    });
  }

  toggle(force) {
    this.isOpen = typeof force === 'boolean' ? force : !this.isOpen;
    document.getElementById('voice-assistant-panel').hidden = !this.isOpen;
    if (this.isOpen && window.lucide) window.lucide.createIcons();
  }

  listen() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      this.show('या ब्राउझरमध्ये आवाज ओळख उपलब्ध नाही. खाली तुमचा प्रश्न लिहा.');
      return;
    }
    this.recognition = new Recognition();
    this.recognition.lang = 'mr-IN';
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;
    const button = document.getElementById('voice-listen-btn');
    button.classList.add('listening');
    button.querySelector('span').textContent = 'ऐकत आहे...';
    this.recognition.onresult = event => this.handle(event.results[0][0].transcript);
    this.recognition.onerror = () => this.show('आवाज समजला नाही. कृपया पुन्हा बोला.');
    this.recognition.onend = () => {
      button.classList.remove('listening');
      button.querySelector('span').textContent = 'बोलायला सुरुवात करा';
    };
    this.recognition.start();
  }

  submitTyped() {
    const input = document.getElementById('voice-text-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    this.handle(text);
  }

  handle(query) {
    const normalized = query.toLocaleLowerCase('mr-IN');
    let reply = 'माफ करा, मला ते समजले नाही. तुम्ही कचरा नोंदवणे, पिकअप, बक्षिसे किंवा प्रोफाइलबद्दल विचारू शकता.';
    let route = null;
    if (/कचरा|नोंद|report/.test(normalized)) {
      route = 'report-waste'; reply = 'कचरा नोंदणी पृष्ठ उघडत आहे. कचऱ्याचा प्रकार निवडा, फोटो काढा आणि स्थान निश्चित करा.';
    } else if (/पिकअप|संकलन|ट्रॅक|कुठे|pickup/.test(normalized)) {
      route = 'live-tracking'; reply = 'तुमच्या कचरा संकलनाचे थेट स्थान उघडत आहे.';
    } else if (/बक्षीस|क्रेडिट|वॉलेट|reward/.test(normalized)) {
      route = 'rewards'; reply = 'तुमचे क्रेडिट्स आणि उपलब्ध बक्षिसे उघडत आहे.';
    } else if (/प्रोफाइल|खाते|profile/.test(normalized)) {
      route = 'profile'; reply = 'तुमचे नागरिक प्रोफाइल उघडत आहे.';
    } else if (/नमस्कार|हॅलो|hello/.test(normalized)) {
      reply = 'नमस्कार! मी रेमिंटचा मराठी आवाज सहाय्यक आहे. मी तुम्हाला कचरा नोंदवणे आणि संकलन तपासण्यात मदत करू शकतो.';
    }
    this.show(`तुम्ही: ${query}\n\n${reply}`);
    if (route && window.AppRouter) window.AppRouter.navigate(route);
    this.speak(reply);
  }

  show(message) {
    document.getElementById('voice-assistant-message').textContent = message;
  }

  async speak(text) {
    try {
      const response = await fetch(`${API_BASE_URL}/voice/speak`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error('ElevenLabs unavailable');
      if (this.audio) this.audio.pause();
      this.audio = new Audio(URL.createObjectURL(await response.blob()));
      await this.audio.play();
    } catch (_) {
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'mr-IN';
        speechSynthesis.speak(utterance);
      }
    }
  }
}

export const VoiceAssistant = new MarathiVoiceAssistant();
