// ── Utilitário de Tags compartilhado ──

const TAG_PALETA = [
    { bg: '#FFE3E3', text: '#C92A2A' },
    { bg: '#FFE8CC', text: '#D9480F' },
    { bg: '#FFF3BF', text: '#866800' },
    { bg: '#EBFBEE', text: '#2B8A3E' },
    { bg: '#E3FAFC', text: '#0C8599' },
    { bg: '#DBE4FF', text: '#364FC7' },
    { bg: '#F3F0FF', text: '#6741D9' },
    { bg: '#FCE4EC', text: '#AD1457' },
    { bg: '#E0F7FA', text: '#00695C' },
    { bg: '#FFF8E1', text: '#F57F17' },
    { bg: '#F1F8E9', text: '#558B2F' },
    { bg: '#E8EAF6', text: '#3949AB' },
];

function tagSlug(nome) {
    return nome.toLowerCase().trim().replace(/\s+/g, '-').replace(/[.$#\[\]/]/g, '');
}

function tagCor(slug) {
    let hash = 0;
    for (let i = 0; i < slug.length; i++) hash = slug.charCodeAt(i) + ((hash << 5) - hash);
    return TAG_PALETA[Math.abs(hash) % TAG_PALETA.length];
}

function renderChip(nome, slug, removivel, onRemove) {
    const cor = tagCor(slug);
    const chip = document.createElement('span');
    chip.className = 'tag-chip';
    chip.dataset.slug = slug;
    chip.style.cssText = `background:${cor.bg};color:${cor.text};border:1px solid ${cor.text}44;`;
    chip.innerHTML = nome + (removivel
        ? `<span class="tag-x" title="Remover">×</span>`
        : '');
    if (removivel && onRemove) {
        chip.querySelector('.tag-x').addEventListener('click', () => onRemove(slug));
    }
    return chip;
}
