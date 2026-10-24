const translations = {
  Citizen: 'नागरिक', Worker: 'कर्मचारी', Command: 'नियंत्रण', Profile: 'प्रोफाइल', Reset: 'रीसेट',
  Home: 'मुख्यपृष्ठ', Activity: 'हालचाल', Report: 'नोंदवा', Rewards: 'बक्षिसे',
  'Report Waste': 'कचरा नोंदवा', 'Report Waste Now': 'आत्ताच कचरा नोंदवा',
  'Available Credits': 'उपलब्ध क्रेडिट्स', Redeem: 'वापरा',
  'Wet Waste': 'ओला कचरा', 'Dry Waste': 'सुका कचरा', 'Harmful Waste': 'घातक कचरा',
  'Ready For Collection': 'संकलनासाठी तयार', 'No Active Pickup In Progress': 'सध्या कोणतेही संकलन सुरू नाही',
  'Segregated Collection Categories': 'वर्गीकृत कचरा संकलन',
  'Recent Collection Ledger': 'अलीकडील संकलन नोंदी', 'Live Map': 'थेट नकाशा',
  'Landfill Waste Diverted': 'लँडफिलपासून वाचवलेला कचरा',
  'Emissions Avoided': 'टाळलेले उत्सर्जन', 'Groundwater Protected': 'संरक्षित भूजल'
};

class LanguageManager {
  constructor() {
    this.language = localStorage.getItem('remintLanguage') || 'en';
    this.originalText = new WeakMap();
    this.observer = new MutationObserver(() => this.apply());
  }

  init() {
    const select = document.getElementById('language-select');
    if (select) {
      select.value = this.language;
      select.addEventListener('change', event => this.setLanguage(event.target.value));
    }
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.apply();
  }

  setLanguage(language) {
    this.language = language === 'mr' ? 'mr' : 'en';
    localStorage.setItem('remintLanguage', this.language);
    document.documentElement.lang = this.language === 'mr' ? 'mr' : 'en';
    this.restore();
    this.apply();
    window.dispatchEvent(new CustomEvent('remint-language-change', { detail: this.language }));
  }

  apply() {
    if (this.language !== 'mr') return;
    document.documentElement.lang = 'mr';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.closest('script, style, input, textarea, option')) return;
      const raw = node.textContent;
      const trimmed = raw.trim();
      if (!translations[trimmed]) return;
      if (!this.originalText.has(node)) this.originalText.set(node, raw);
      node.textContent = raw.replace(trimmed, translations[trimmed]);
    });
  }

  restore() {
    document.querySelectorAll('body *').forEach(element => {
      element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && this.originalText.has(node)) {
          node.textContent = this.originalText.get(node);
        }
      });
    });
  }
}

export const I18n = new LanguageManager();
