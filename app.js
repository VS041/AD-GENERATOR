/* ============================================================
   ad-generator · app
   week 1 scaffolding · state + upload + UI wiring
   actual AI generation arrives in week 2
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================

  const CONFIG = {
    // worker URL · update once Cloudflare Worker is deployed
    // for week 1 dev, we don't actually call this yet
    WORKER_URL: 'https://ad-generator.<your-subdomain>.workers.dev',

    // upload limits
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5 MB
    ACCEPTED_TYPES: ['image/jpeg', 'image/png'],

    // magic-byte signatures · client-side first line of defense
    // (real validation happens server-side in worker)
    MAGIC_BYTES: {
      jpeg: [0xff, 0xd8, 0xff],
      png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    }
  };

  // ============================================================
  // STATE
  // ============================================================

  const state = {
    template: null,        // 'festival' | 'launch' | 'discount' | 'arrival' | 'testimonial'
    language: 'en',        // 'en' | 'hi'
    file: null,            // File object
    fileDataUrl: null,     // for preview
    headline: '',
    cta: 'Shop now',
    isGenerating: false
  };

  // ============================================================
  // DOM REFS
  // ============================================================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    templateGrid: $('#template-grid'),
    templateCards: $$('.template-card'),
    langButtons: $$('.lang-btn'),
    langToggle: $('#lang-toggle'),
    uploadZone: $('#upload-zone'),
    fileInput: $('#file-input'),
    uploadEmpty: $('#upload-empty'),
    uploadPreview: $('#upload-preview'),
    uploadImg: $('#upload-img'),
    uploadName: $('#upload-name'),
    uploadSize: $('#upload-size'),
    uploadClear: $('#upload-clear'),
    headline: $('#headline'),
    cta: $('#cta'),
    generateBtn: $('#generate-btn'),
    generateText: $('#generate-text'),
    generateStatus: $('#generate-status'),
    stepBlocks: $$('.step-block')
  };

  // ============================================================
  // TEMPLATE SELECTION
  // ============================================================

  dom.templateCards.forEach((card) => {
    card.addEventListener('click', () => {
      dom.templateCards.forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      state.template = card.dataset.template;
      updateStepProgress();
      updateGenerateButton();
    });
  });

  // ============================================================
  // LANGUAGE TOGGLE
  // ============================================================

  dom.langButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      dom.langButtons.forEach((b) => b.classList.remove('is-selected'));
      btn.classList.add('is-selected');
      state.language = btn.dataset.lang;

      // swap input visual hint when Hindi
      if (state.language === 'hi') {
        dom.headline.classList.add('is-deva');
        dom.headline.placeholder = 'खाली छोड़ें — AI लिख देगा';
        dom.cta.classList.add('is-deva');
        if (dom.cta.value === 'Shop now') dom.cta.value = 'अभी खरीदें';
      } else {
        dom.headline.classList.remove('is-deva');
        dom.headline.placeholder = 'Leave blank — AI will write one for you';
        dom.cta.classList.remove('is-deva');
        if (dom.cta.value === 'अभी खरीदें') dom.cta.value = 'Shop now';
      }
    });
  });

  // ============================================================
  // FILE UPLOAD · validation + preview
  // ============================================================

  // click-through to file input
  dom.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });

  // drag and drop
  ['dragenter', 'dragover'].forEach((evt) => {
    dom.uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.uploadZone.classList.add('is-drag');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dom.uploadZone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.uploadZone.classList.remove('is-drag');
    });
  });
  dom.uploadZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // remove file
  dom.uploadClear.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearFile();
  });

  async function handleFile(file) {
    // type check
    if (!CONFIG.ACCEPTED_TYPES.includes(file.type)) {
      alert('Please upload a JPG or PNG.');
      return;
    }

    // size check
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      alert(`File is too large. Max ${CONFIG.MAX_FILE_SIZE / 1024 / 1024} MB.`);
      return;
    }

    // magic-byte sniff · catches files renamed to .jpg/.png
    const isValid = await checkMagicBytes(file);
    if (!isValid) {
      alert('That file does not appear to be a valid image.');
      return;
    }

    // accepted · update state + show preview
    state.file = file;
    state.fileDataUrl = await fileToDataUrl(file);

    dom.uploadImg.src = state.fileDataUrl;
    dom.uploadName.textContent = file.name;
    dom.uploadSize.textContent = formatBytes(file.size);
    dom.uploadEmpty.style.display = 'none';
    dom.uploadPreview.style.display = 'flex';
    dom.uploadZone.classList.add('has-file');

    updateStepProgress();
    updateGenerateButton();
  }

  function clearFile() {
    state.file = null;
    state.fileDataUrl = null;
    dom.fileInput.value = '';
    dom.uploadEmpty.style.display = '';
    dom.uploadPreview.style.display = 'none';
    dom.uploadZone.classList.remove('has-file');
    updateStepProgress();
    updateGenerateButton();
  }

  function checkMagicBytes(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arr = new Uint8Array(e.target.result);
        const isJpeg = matchBytes(arr, CONFIG.MAGIC_BYTES.jpeg);
        const isPng = matchBytes(arr, CONFIG.MAGIC_BYTES.png);
        resolve(isJpeg || isPng);
      };
      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(file.slice(0, 8));
    });
  }

  function matchBytes(arr, signature) {
    return signature.every((byte, i) => arr[i] === byte);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  // ============================================================
  // TEXT INPUTS
  // ============================================================

  dom.headline.addEventListener('input', (e) => {
    state.headline = e.target.value;
  });
  dom.cta.addEventListener('input', (e) => {
    state.cta = e.target.value;
  });

  // ============================================================
  // STEP PROGRESS · visual indicator
  // ============================================================

  function updateStepProgress() {
    const completion = {
      template: !!state.template,
      language: true, // always set
      upload: !!state.file,
      copy: true // optional
    };

    dom.stepBlocks.forEach((block) => {
      const step = block.dataset.step;
      block.classList.remove('is-active', 'is-done');
      if (completion[step]) {
        block.classList.add('is-done');
      }
    });

    // highlight first incomplete step
    const order = ['template', 'language', 'upload', 'copy'];
    const nextStep = order.find((s) => !completion[s]);
    if (nextStep) {
      const block = document.querySelector(`[data-step="${nextStep}"]`);
      if (block) block.classList.add('is-active');
    }
  }

  // ============================================================
  // GENERATE BUTTON
  // ============================================================

  function updateGenerateButton() {
    const ready = state.template && state.file;
    dom.generateBtn.disabled = !ready || state.isGenerating;

    if (state.isGenerating) {
      dom.generateText.textContent = 'Generating…';
      dom.generateStatus.textContent = 'AI is working · ~10 seconds';
    } else if (ready) {
      dom.generateText.textContent = 'Generate ad →';
      dom.generateStatus.textContent = 'Ready · ~₹1 per generation';
    } else if (!state.template && !state.file) {
      dom.generateText.textContent = 'Pick a template & upload to begin';
      dom.generateStatus.textContent = 'Ready · ~₹1 per generation';
    } else if (!state.template) {
      dom.generateText.textContent = 'Pick a template';
      dom.generateStatus.textContent = 'Almost there · 1 step left';
    } else {
      dom.generateText.textContent = 'Upload a product photo';
      dom.generateStatus.textContent = 'Almost there · 1 step left';
    }
  }

  dom.generateBtn.addEventListener('click', () => {
    // WEEK 1 PLACEHOLDER · actual generation comes in week 2
    state.isGenerating = true;
    updateGenerateButton();

    setTimeout(() => {
      state.isGenerating = false;
      updateGenerateButton();
      alert(
        'Week 1 build · UI scaffolding only.\n\n' +
        'AI generation pipeline arrives in Week 2:\n' +
        '  · background removal (fal.ai)\n' +
        '  · scene generation (fal.ai Flux Schnell)\n' +
        '  · headline copy (Claude API)\n' +
        '  · canvas composite + download\n\n' +
        'Selected: ' + state.template + ' · ' + state.language +
        '\nFile: ' + state.file.name
      );
    }, 1200);
  });

  // ============================================================
  // INIT
  // ============================================================

  updateStepProgress();
  updateGenerateButton();

  console.log('[ad-generator] week 1 scaffolding loaded');
})();
