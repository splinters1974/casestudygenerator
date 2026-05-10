const STORAGE_KEY = 'amerescoCaseStudy';
const API_KEY_STORAGE = 'amerescoApiKey';
let currentSlide = 1;
let generatedContent = null;
let images = [null, null, null];
let clearPending = false;
let clearTimer = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey() {
    return document.getElementById('apiKeyInput').value.trim();
}

function saveApiKey(value) {
    if (value.trim()) {
        localStorage.setItem(API_KEY_STORAGE, value.trim());
    } else {
        localStorage.removeItem(API_KEY_STORAGE);
    }
}

function esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.className = `toast toast-${type}`;
    }, 3000);
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
}

function extractJSON(text) {
    try { return JSON.parse(text); } catch {}
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
        return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error('Could not parse AI response');
}

// ── Storage ───────────────────────────────────────────────────────────────────

function saveToStorage() {
    const data = {
        clientName: document.getElementById('clientName').value,
        projectTitle: document.getElementById('projectTitle').value,
        projectType: document.getElementById('projectType').value,
        projectSize: document.getElementById('projectSize').value,
        location: document.getElementById('location').value,
        kwhGeneration: document.getElementById('kwhGeneration').value,
        carbonSavings: document.getElementById('carbonSavings').value,
        financialSavings: document.getElementById('financialSavings').value,
        completionDate: document.getElementById('completionDate').value,
        customerName: document.getElementById('customerName').value,
        customerRole: document.getElementById('customerRole').value,
        customerQuote: document.getElementById('customerQuote').value,
        supplierName: document.getElementById('supplierName').value,
        supplierRole: document.getElementById('supplierRole').value,
        supplierQuote: document.getElementById('supplierQuote').value,
        challenge: document.getElementById('challenge').value,
        solution: document.getElementById('solution').value,
        results: document.getElementById('results').value,
        images: images,
        generatedContent: generatedContent
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const data = JSON.parse(stored);
        const fields = [
            'clientName','projectTitle','projectType','projectSize','location',
            'kwhGeneration','carbonSavings','financialSavings','completionDate',
            'customerName','customerRole','customerQuote',
            'supplierName','supplierRole','supplierQuote',
            'challenge','solution','results',
            'contentLength','audienceType'
        ];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = data[id] || '';
        });
        if (data.images) {
            images = data.images;
            for (let i = 0; i < 3; i++) {
                if (images[i]) displayImagePreview(i + 1, images[i]);
            }
        }
        if (data.generatedContent) {
            generatedContent = data.generatedContent;
            renderContent();
            document.getElementById('outputSection').style.display = 'block';
        }
    }

    const storedKey = localStorage.getItem(API_KEY_STORAGE);
    if (storedKey) document.getElementById('apiKeyInput').value = storedKey;
    updateTabLabels();
}

// ── Image Handling ────────────────────────────────────────────────────────────

function handleImageUpload(slotNum, input) {
    const file = input.files[0];
    if (!file) return;
    const MAX_BYTES = 2 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
        showToast('Image must be under 2 MB', 'error');
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        images[slotNum - 1] = e.target.result;
        displayImagePreview(slotNum, e.target.result);
        saveToStorage();
    };
    reader.readAsDataURL(file);
}

function displayImagePreview(slotNum, base64) {
    const container = document.getElementById(`image${slotNum}-preview-container`);
    const img = document.createElement('img');
    img.src = base64;
    img.className = 'image-preview';
    img.alt = `Uploaded image ${slotNum}`;
    const remove = document.createElement('span');
    remove.className = 'remove-image';
    remove.textContent = 'Remove';
    remove.tabIndex = 0;
    remove.setAttribute('role', 'button');
    remove.setAttribute('aria-label', `Remove image ${slotNum}`);
    remove.onclick = () => removeImage(slotNum);
    remove.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeImage(slotNum); }
    };
    container.innerHTML = '';
    container.appendChild(img);
    container.appendChild(remove);
}

function removeImage(slotNum) {
    images[slotNum - 1] = null;
    const container = document.getElementById(`image${slotNum}-preview-container`);
    container.innerHTML = `
        <div class="image-label">Image ${slotNum}</div>
        <div style="font-size:24px;color:var(--gold);margin:20px 0;" aria-hidden="true">+</div>
        <div style="font-size:11px;color:#888;">Click to upload</div>
    `;
    document.getElementById(`image${slotNum}`).value = '';
    saveToStorage();
}

// ── Generation ────────────────────────────────────────────────────────────────

async function generateContent() {
    const apiKey = getApiKey();
    if (!apiKey) {
        showStatus('Please enter your Anthropic API key above', 'error');
        document.getElementById('apiKeyInput').focus();
        return;
    }

    const clientName = document.getElementById('clientName').value.trim();
    const projectTitle = document.getElementById('projectTitle').value.trim();
    const challenge = document.getElementById('challenge').value.trim();
    const solution = document.getElementById('solution').value.trim();
    const results = document.getElementById('results').value.trim();

    if (!clientName || !projectTitle || !challenge || !solution || !results) {
        showStatus('Please fill in all required fields', 'error');
        return;
    }

    const btn = document.querySelector('.btn-primary');
    btn.disabled = true;
    showStatus('Generating your case studies…', 'loading');

    try {
        const prompt = buildPrompt();
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-request-proxy': 'true'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 3000,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || response.statusText);
        }

        const data = await response.json();
        generatedContent = extractJSON(data.content[0].text);

        renderContent();
        document.getElementById('outputSection').style.display = 'block';
        showStatus('Case studies generated successfully!', 'success');
        window.scrollTo({ top: document.getElementById('outputSection').offsetTop, behavior: 'smooth' });
    } catch (error) {
        console.error('Generation error:', error);
        showStatus(`Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

function updateTabLabels() {
    const isInternal = document.getElementById('audienceType').value === 'internal';
    const labels = isInternal
        ? ['Briefing Slides', 'Executive Summary', 'Full Report']
        : ['LinkedIn Carousel', 'Marketing PDF', 'Blog Article'];
    document.getElementById('tab-carousel').textContent = labels[0];
    document.getElementById('tab-pdf').textContent = labels[1];
    document.getElementById('tab-longform').textContent = labels[2];
}

function buildPrompt() {
    const get = id => document.getElementById(id).value;
    const length = get('contentLength') || 'medium';
    const isInternal = get('audienceType') === 'internal';

    const wc = {
        short:  { slide: 30, pdfSec: '1–2 sentences',   intro: '80–100',  ch: '120–150', sol: '150–180', res: '100–130' },
        medium: { slide: 50, pdfSec: '2–3 sentences',   intro: '150–180', ch: '180–220', sol: '220–260', res: '170–210' },
        large:  { slide: 60, pdfSec: '4–5 sentences',   intro: '250–300', ch: '350–400', sol: '400–450', res: '300–350' }
    }[length];

    const audienceBlock = isInternal
        ? `AUDIENCE: Internal stakeholders — senior management, finance, operations
TONE & FOCUS:
- Factual, analytical, business-case led
- Lead with financial metrics: payback period, ROI %, annual savings
- Where data allows, calculate payback period (project cost ÷ annual savings) and percentage improvement
- Include technical implementation detail and any complexity overcome
- Reference capital expenditure, operational savings, and maintenance impact candidly
- Include a brief "why this solution / why Ameresco" procurement rationale
- Acknowledge challenges and how they were resolved — internal readers value honesty`
        : `AUDIENCE: External — prospects, clients, LinkedIn, press
TONE & FOCUS:
- Professional, confident, aspirational
- Open every section with the single most impressive outcome to hook the reader
- Frame Ameresco as the expert partner that understood the client's unique challenge
- Include a clear "why Ameresco" moment that implies competitive differentiation
- Use accessible language — no internal jargon
- Quotes must appear immediately after the specific claim they validate, never as standalone blocks`;

    const format1Guidance = isInternal
        ? `BRIEFING SLIDES (5 slides for an internal presentation):
Slide 1 — Context: client, project type, scale
Slide 2 — Business Case: the operational or financial problem that justified investment
Slide 3 — Approach: what Ameresco delivered and why this solution was chosen
Slide 4 — Outcomes: hard numbers — savings, ROI, payback period
Slide 5 — Lessons & Next Steps: key takeaways and recommended actions`
        : `LINKEDIN CAROUSEL (5 slides designed to stop the scroll):
Slide 1 — Hook: lead with the single most impressive outcome — specific, not vague
Slide 2 — Challenge: the client's pain state before Ameresco — create before/after contrast
Slide 3 — Solution: what Ameresco delivered — the approach, not a feature list
Slide 4 — Results: 2–3 hard numbers that prove transformation
Slide 5 — CTA: invite similar organisations to start the conversation with Ameresco`;

    const format2Name = isInternal ? 'EXECUTIVE SUMMARY' : 'MARKETING CASE STUDY PDF';
    const format3Name = isInternal ? 'FULL PROJECT REPORT' : 'BLOG ARTICLE';

    return `You are an expert B2B case study writer for Ameresco, a leading energy efficiency and renewable energy company delivering projects across the UK.

Generate three content formats from the project data below. Every version must follow a clear narrative arc: client context → before-state (challenge) → solution journey → measurable results → social proof → call to action. Create vivid before/after contrast throughout — the gap between pain state and transformed state is what makes case studies compelling.

${audienceBlock}

PROJECT DATA:
- Client: ${get('clientName')}
- Project: ${get('projectTitle')}
- Type: ${get('projectType')}
- Size: ${get('projectSize')}
- Location: ${get('location')}
- Annual Generation/Saving: ${get('kwhGeneration')} kWh
- Carbon Saving: ${get('carbonSavings')} tonnes CO₂/year
- Annual Financial Saving: £${get('financialSavings')}
- Completion: ${get('completionDate')}

CHALLENGE (expand into narrative — describe the before-state vividly):
${get('challenge')}

SOLUTION (expand into narrative — describe the journey, not just a feature list):
${get('solution')}

RESULTS (refine and frame with ROI context where data allows):
${get('results')}

STAKEHOLDERS:
Customer: ${get('customerName')}, ${get('customerRole')}
Customer quote: "${get('customerQuote')}"
Partner/Supplier: ${get('supplierName')}, ${get('supplierRole')}
Partner quote: "${get('supplierQuote')}"

━━━━━━━━━━━━━━━━━━━ FORMAT INSTRUCTIONS ━━━━━━━━━━━━━━━━━━━

${format1Guidance}
Each slide: max ${wc.slide} words. Titles must be specific and results-led — never generic labels like "The Challenge" or "Our Solution".

${format2Name}:
- title: A result-led headline (not just the project name)
- challenge: ${wc.pdfSec} — describe the before-state
- solution: ${wc.pdfSec} — describe what was delivered and why
- results: ${wc.pdfSec} — end with a crisp before/after summary and the headline metric

${format3Name}:
- title: Compelling, SEO-friendly, result-led headline
- intro: ${wc.intro} words — open with the headline outcome, then set client context
- challenge: ${wc.ch} words — paint the before-state vividly; why this problem mattered to the business
- solution: ${wc.sol} words — the journey and approach; include a "why Ameresco" moment
- results: ${wc.res} words — quantified outcomes with ROI framing; weave quotes in immediately after the claims they support

━━━━━━━━━━━━━━━━━━━ UNIVERSAL RULES ━━━━━━━━━━━━━━━━━━━
- All financial figures in £, all spellings UK English (realise, organisation, programme, recognise)
- Never invent data not provided; if a metric is absent, write around it
- Where the data allows, calculate payback period and percentage improvements
- Quotes must validate a specific preceding claim — never float free

Return ONLY valid JSON with no markdown or preamble:

{
  "carousel": [
    {"title": "result-led title", "text": "slide text"},
    {"title": "result-led title", "text": "slide text"},
    {"title": "result-led title", "text": "slide text"},
    {"title": "result-led title", "text": "slide text"},
    {"title": "result-led title", "text": "slide text"}
  ],
  "pdfShort": {
    "title": "result-led headline",
    "challenge": "per instructions",
    "solution": "per instructions",
    "results": "per instructions"
  },
  "longForm": {
    "title": "result-led SEO headline",
    "intro": "per word count",
    "challenge": "per word count",
    "solution": "per word count",
    "results": "per word count"
  }
}`;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function buildSlide(slideEl, slide, imageBase64) {
    slideEl.innerHTML = '';
    if (imageBase64) {
        const img = document.createElement('img');
        img.src = imageBase64;
        img.alt = '';
        slideEl.appendChild(img);
    }
    const textDiv = document.createElement('div');
    textDiv.className = 'carousel-text';
    const h3 = document.createElement('h3');
    h3.textContent = slide.title;
    const p = document.createElement('p');
    p.textContent = slide.text;
    textDiv.appendChild(h3);
    textDiv.appendChild(p);
    slideEl.appendChild(textDiv);
}

function renderContent() {
    if (!generatedContent) return;

    // Carousel — DOM API to prevent XSS
    generatedContent.carousel.forEach((slide, i) => {
        buildSlide(document.getElementById(`slide${i + 1}`), slide, i < 3 ? images[i] : null);
    });

    // PDF — form values escaped, AI text trusted
    document.getElementById('pdfTitle').textContent = generatedContent.pdfShort.title;
    document.getElementById('pdfMeta').innerHTML =
        `<strong>${esc(document.getElementById('projectType').value)}</strong> | ` +
        `${esc(document.getElementById('location').value)} | ` +
        `${esc(document.getElementById('completionDate').value)}`;

    let pdfBody = '';
    if (images[0]) pdfBody += `<img src="${images[0]}" class="pdf-image" alt="">`;
    pdfBody += `<div class="pdf-section"><h3>Challenge</h3><p>${generatedContent.pdfShort.challenge}</p></div>`;
    pdfBody += `<div class="pdf-section"><h3>Solution</h3><p>${generatedContent.pdfShort.solution}</p></div>`;
    if (images[1]) pdfBody += `<img src="${images[1]}" class="pdf-image" alt="">`;
    pdfBody += `<div class="pdf-section"><h3>Results</h3><p>${generatedContent.pdfShort.results}</p></div>`;
    if (images[2]) pdfBody += `<img src="${images[2]}" class="pdf-image" alt="">`;

    const metrics = [];
    if (document.getElementById('kwhGeneration').value)
        metrics.push(`${esc(document.getElementById('kwhGeneration').value)} kWh/year`);
    if (document.getElementById('carbonSavings').value)
        metrics.push(`${esc(document.getElementById('carbonSavings').value)}t CO₂ saved`);
    if (document.getElementById('financialSavings').value)
        metrics.push(`£${esc(document.getElementById('financialSavings').value)}/year`);
    if (metrics.length > 0) {
        pdfBody += `<div class="pdf-section" style="background:var(--light-slate);padding:15px;border-radius:4px;">` +
            `<strong>Key Metrics:</strong> ${metrics.join(' • ')}</div>`;
    }
    document.getElementById('pdfBody').innerHTML = pdfBody;

    // Long Form
    document.getElementById('longformTitle').textContent = generatedContent.longForm.title;
    document.getElementById('longformMeta').innerHTML =
        `<div><strong>Project Type:</strong> ${esc(document.getElementById('projectType').value)}</div>` +
        `<div><strong>Location:</strong> ${esc(document.getElementById('location').value)}</div>` +
        `<div><strong>Size:</strong> ${esc(document.getElementById('projectSize').value)}</div>` +
        `<div><strong>Completion:</strong> ${esc(document.getElementById('completionDate').value)}</div>`;

    let longformBody = '';
    if (images[0]) longformBody += `<img src="${images[0]}" class="longform-image" alt="">`;
    longformBody += `<p><strong>Overview</strong></p><p>${generatedContent.longForm.intro}</p>`;
    longformBody += `<h3>The Challenge</h3><p>${generatedContent.longForm.challenge}</p>`;
    if (images[1]) longformBody += `<img src="${images[1]}" class="longform-image" alt="">`;
    longformBody += `<h3>Our Solution</h3><p>${generatedContent.longForm.solution}</p>`;
    if (images[2]) longformBody += `<img src="${images[2]}" class="longform-image" alt="">`;
    longformBody += `<h3>Results &amp; Impact</h3><p>${generatedContent.longForm.results}</p>`;
    document.getElementById('longformBody').innerHTML = longformBody;
}

// ── UI ────────────────────────────────────────────────────────────────────────

function switchTab(event, tabName) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.tab-button').forEach(el => {
        el.setAttribute('aria-selected', 'false');
    });
    const panel = document.getElementById(tabName);
    panel.classList.add('active');
    panel.removeAttribute('aria-hidden');
    event.currentTarget.setAttribute('aria-selected', 'true');
    panel.focus();
}

function nextSlide() {
    currentSlide = currentSlide === 5 ? 1 : currentSlide + 1;
    updateSlide();
}

function prevSlide() {
    currentSlide = currentSlide === 1 ? 5 : currentSlide - 1;
    updateSlide();
}

function updateSlide() {
    document.querySelectorAll('.carousel-slide').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
    });
    const active = document.getElementById(`slide${currentSlide}`);
    active.classList.add('active');
    active.removeAttribute('aria-hidden');
    document.getElementById('currentSlide').textContent = currentSlide;
}

function clearForm() {
    const btn = document.getElementById('clearBtn');
    if (!clearPending) {
        clearPending = true;
        btn.textContent = 'Sure?';
        btn.classList.add('btn-warning');
        clearTimer = setTimeout(() => {
            clearPending = false;
            btn.textContent = 'Clear';
            btn.classList.remove('btn-warning');
        }, 3000);
    } else {
        clearTimeout(clearTimer);
        clearPending = false;
        btn.textContent = 'Clear';
        btn.classList.remove('btn-warning');
        document.querySelectorAll('input:not(#apiKeyInput), select, textarea').forEach(el => el.value = '');
        images = [null, null, null];
        generatedContent = null;
        for (let i = 1; i <= 3; i++) removeImage(i);
        localStorage.removeItem(STORAGE_KEY);
        showStatus('', '');
        document.getElementById('outputSection').style.display = 'none';
    }
}

// ── Downloads ─────────────────────────────────────────────────────────────────

function downloadPDF() {
    const element = document.getElementById('pdfContent');
    const opt = {
        margin: 10,
        filename: `${document.getElementById('projectTitle').value || 'case-study'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
    };
    html2pdf().set(opt).from(element).save();
}

async function downloadCarousel() {
    if (!generatedContent) {
        showToast('Generate content first', 'error');
        return;
    }
    const slide = document.querySelector('.carousel-slide.active');
    showToast('Preparing download…', 'info');
    try {
        const canvas = await html2canvas(slide, {
            scale: 2,
            useCORS: true,
            backgroundColor: null,
            logging: false
        });
        const link = document.createElement('a');
        link.download = `${document.getElementById('projectTitle').value || 'case-study'}-slide-${currentSlide}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch {
        showToast('Download failed — try screenshotting the slide instead', 'error');
    }
}

function copyCarouselText() {
    let text = '';
    generatedContent.carousel.forEach((slide, i) => {
        text += `Slide ${i + 1}: ${slide.title}\n${slide.text}\n\n`;
    });
    navigator.clipboard.writeText(text).then(() => {
        showToast('Carousel text copied to clipboard', 'success');
    });
}

function downloadLongForm() {
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${document.getElementById('longformTitle').textContent}</title>
    <style>
        body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; }
        h1 { font-size: 32px; margin-bottom: 20px; }
        h3 { font-size: 20px; margin-top: 30px; margin-bottom: 15px; color: #4A8A37; }
        p { line-height: 1.8; margin-bottom: 15px; }
        .meta { color: #888; font-size: 14px; margin-bottom: 30px; border-bottom: 1px solid #ddd; padding-bottom: 20px; }
        img { max-width: 100%; height: auto; margin: 30px 0; }
    </style>
</head>
<body>
    <h1>${document.getElementById('longformTitle').textContent}</h1>
    <div class="meta">${document.getElementById('longformMeta').innerHTML}</div>
    ${document.getElementById('longformBody').innerHTML}
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${document.getElementById('projectTitle').value || 'case-study'}.html`;
    a.click();
    URL.revokeObjectURL(url);
}

function copyPdfHtml() {
    navigator.clipboard.writeText(document.getElementById('pdfContent').innerHTML).then(() => {
        showToast('HTML copied to clipboard', 'success');
    });
}

function copyLongFormHtml() {
    navigator.clipboard.writeText(document.getElementById('longformContent').innerHTML).then(() => {
        showToast('HTML copied to clipboard', 'success');
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('change', saveToStorage);
});

window.addEventListener('DOMContentLoaded', loadFromStorage);
