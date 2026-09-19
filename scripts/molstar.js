(function() {
  'use strict';

  const MOLSTAR_COMPONENT_URL = 'https://cdn.jsdelivr.net/npm/pdbe-molstar@3.3.0/build/pdbe-molstar-component.js';

  function addMediaAlternatives() {
    document.querySelectorAll('.workshop-companion').forEach(companion => {
      const title = (companion.querySelector('.wc-title')?.textContent || 'Workshop session')
        .replace(/^\s*🎥\s*/, '')
        .replace(/^Live workshop recording\s*[—-]\s*/i, '')
        .trim();

      const video = companion.querySelector('.wc-video iframe');
      if (video && !video.title) video.title = title + ' workshop recording';
      if (video && !companion.querySelector('.media-alternative-video')) {
        const match = video.src.match(/\/embed\/([^?&#/]+)/);
        const note = document.createElement('p');
        note.className = 'media-alternative media-alternative-video';
        note.append(document.createTextNode('The recording is optional; the lesson text covers the core material. '));
        if (match) {
          const link = document.createElement('a');
          link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(match[1]);
          link.target = '_blank';
          link.rel = 'noopener';
          link.textContent = 'Open the recording on YouTube';
          link.setAttribute('aria-label', 'Open ' + title + ' on YouTube');
          note.append(link, document.createTextNode(' if the embedded player is unavailable.'));
        }
        video.closest('.wc-video').insertAdjacentElement('afterend', note);
      }

      companion.querySelectorAll('details iframe').forEach(frame => {
        if (!frame.title) frame.title = title + ' workshop slides';
        const details = frame.closest('details');
        if (!details || details.querySelector('.media-alternative-slides')) return;

        const note = document.createElement('p');
        const link = document.createElement('a');
        note.className = 'media-alternative media-alternative-slides';
        note.append(document.createTextNode('The slides are optional; equivalent explanations appear in the lesson. '));
        link.href = frame.src.replace(/\/embed(?:\?.*)?$/, '/view');
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Open the slide deck in a new tab';
        link.setAttribute('aria-label', 'Open slides for ' + title + ' in a new tab');
        note.appendChild(link);
        frame.insertAdjacentElement('beforebegin', note);
      });
    });
  }

  let diagramNumber = 0;

  function nameMermaidDiagrams(root = document) {
    root.querySelectorAll('svg.mermaid-js:not([aria-labelledby])').forEach(diagram => {
      const namespace = 'http://www.w3.org/2000/svg';
      const section = diagram.closest('section');
      const heading = section && section.querySelector(':scope > h2, :scope > h3, :scope > h4');
      const idBase = diagram.id || 'course-diagram-' + (++diagramNumber);
      const title = document.createElementNS(namespace, 'title');
      const description = document.createElementNS(namespace, 'desc');
      const steps = [...new Set(Array.from(diagram.querySelectorAll('.nodeLabel'))
        .map(node => node.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean))];

      title.id = idBase + '-title';
      title.textContent = heading ? 'Flowchart for ' + heading.textContent.trim() : 'Course workflow flowchart';
      description.id = idBase + '-description';
      description.textContent = steps.length
        ? 'The flowchart contains these labeled steps: ' + steps.join('; ') + '.'
        : 'A visual flowchart supporting the surrounding lesson text.';
      diagram.prepend(description);
      diagram.prepend(title);
      diagram.setAttribute('aria-labelledby', title.id);
      diagram.setAttribute('aria-describedby', description.id);
    });
  }

  function improveSharedAccessibility() {
    addMediaAlternatives();
    nameMermaidDiagrams();
    document.querySelectorAll('.navbar-toggler[role="menu"]').forEach(button => {
      button.removeAttribute('role');
    });

    const diagramParents = new Set(Array.from(document.querySelectorAll('pre.mermaid-js'), node => node.parentElement));
    diagramParents.forEach(parent => {
      // Quarto replaces each source pre with its SVG asynchronously after load.
      // Observe only that container and stop once its diagrams have rendered.
      const observer = new MutationObserver(() => {
        nameMermaidDiagrams(parent);
        if (!parent.querySelector('pre.mermaid-js')) observer.disconnect();
      });
      observer.observe(parent, {childList: true});
    });

    const regions = [...new Set([
      ...document.querySelectorAll('main table, main pre:not(.sourceCode):not(.mermaid-js), main div.sourceCode, main .mermaid'),
      ...diagramParents
    ])];
    function updateOverflow(changed) {
      // Read every geometry value before changing focus attributes.
      const measurements = changed.map(region => ({
        region,
        focusable: region.matches('div.sourceCode') || region.scrollWidth > region.clientWidth + 1
      }));
      measurements.forEach(({region, focusable}) => {
        if (focusable && !region.hasAttribute('tabindex')) {
          region.tabIndex = 0;
          region.dataset.overflowFocus = 'true';
        } else if (!focusable && region.dataset.overflowFocus === 'true') {
          region.removeAttribute('tabindex');
          delete region.dataset.overflowFocus;
        }
      });
    }
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(entries => updateOverflow(entries.map(entry => entry.target)));
      regions.forEach(region => observer.observe(region));
    } else {
      let scheduled = false;
      window.addEventListener('resize', () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; updateOverflow(regions); });
      }, {passive: true});
    }
    updateOverflow(regions);
  }

  function prepareViewer(viewer) {
    const container = viewer.closest('.molstar-container');
    const moleculeId = (viewer.getAttribute('molecule-id') || '').toUpperCase();
    if (!container) return;

    const heading = container.previousElementSibling && container.previousElementSibling.matches('h2, h3')
      ? container.previousElementSibling
      : container.parentElement && container.parentElement.querySelector('h2, h3');
    const alternative = container.nextElementSibling && container.nextElementSibling.matches('.molstar-alternative')
      ? container.nextElementSibling
      : null;
    container.setAttribute('role', 'region');
    if (heading && heading.id) container.setAttribute('aria-labelledby', heading.id);
    else container.setAttribute('aria-label', 'Interactive molecular structure');
    if (alternative) {
      if (!alternative.id) alternative.id = (viewer.id || 'molecular-viewer') + '-alternative';
      container.setAttribute('aria-describedby', alternative.id);
    }
    container.setAttribute('aria-busy', 'true');

    viewer.dataset.accessibleName = moleculeId
      ? 'Interactive three-dimensional molecular structure for PDB ' + moleculeId
      : 'Interactive three-dimensional molecular structure';

    const linkSelector = 'a.msp-logo:not([aria-label]), a.msp-pdbe-link:not([aria-label])';
    function nameViewerLinks(root) {
      if (root.nodeType !== Node.ELEMENT_NODE) return;
      const links = Array.from(root.querySelectorAll(linkSelector));
      if (root.matches(linkSelector)) links.unshift(root);
      links.forEach(link => {
        link.setAttribute('aria-label', link.matches('.msp-logo')
          ? 'Open the Mol* project website'
          : moleculeId ? 'Open PDB ' + moleculeId + ' on PDBe' : 'Open this structure on PDBe');
      });
    }

    nameViewerLinks(viewer);
    const observer = new MutationObserver(records => {
      const added = new Set();
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && viewer.contains(node)) added.add(node);
      }));
      added.forEach(node => {
        let parent = node.parentElement;
        while (parent && parent !== viewer && !added.has(parent)) parent = parent.parentElement;
        if (!added.has(parent)) nameViewerLinks(node);
      });
    });
    observer.observe(viewer, {childList: true, subtree: true});

    const status = document.createElement('p');
    status.className = 'molstar-load-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = 'Loading the optional interactive structure viewer…';
    container.prepend(status);
  }

  function showLoadFailure() {
    document.querySelectorAll('.molstar-container').forEach(container => {
      container.setAttribute('aria-busy', 'false');
      container.classList.add('molstar-failed');
      const status = container.querySelector('.molstar-load-status');
      if (status) {
        status.setAttribute('role', 'alert');
        status.textContent = 'The interactive viewer could not load. Use the non-interactive structure alternative below.';
      }
    });
  }

  function initialiseMolstar() {
    const viewers = Array.from(document.querySelectorAll('pdbe-molstar'));
    if (viewers.length === 0) return;

    viewers.forEach(prepareViewer);
    const script = document.createElement('script');
    script.src = MOLSTAR_COMPONENT_URL;
    script.async = true;
    script.addEventListener('error', showLoadFailure);
    script.addEventListener('load', () => {
      const ready = window.customElements && customElements.whenDefined
        ? customElements.whenDefined('pdbe-molstar')
        : Promise.resolve();
      ready.then(() => {
        document.querySelectorAll('.molstar-container').forEach(container => {
          container.setAttribute('aria-busy', 'false');
          container.classList.add('molstar-ready');
          const status = container.querySelector('.molstar-load-status');
          if (status) status.remove();
        });
      }).catch(showLoadFailure);
    });
    document.head.appendChild(script);
  }

  function initialisePage() {
    improveSharedAccessibility();
    initialiseMolstar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisePage, {once: true});
  } else {
    initialisePage();
  }
})();
