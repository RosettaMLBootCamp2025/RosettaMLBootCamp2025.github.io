(function() {
  'use strict';

  const STORAGE_KEY = 'bootcamp_progress_v2';
  const LEGACY_STORAGE_KEY = 'bootcamp2025_progress';
  const LAST_PAGE_KEY = 'bootcamp2025_lastpage';
  const SCHEMA_VERSION = 2;
  const MAX_PROGRESS_BYTES = 256 * 1024;
  const MAX_PROGRESS_IDS = 1000;
  const MAX_ID_LENGTH = 128;

  function normalisePath(path) {
    if (!path) return '/';
    const clean = path.split('#')[0].split('?')[0].replace(/\/+/g, '/');
    if (clean.endsWith('/')) return clean + 'index.html';
    return clean;
  }

  function lessonPath(lesson) {
    const value = lesson.path || lesson.href || '';
    return normalisePath(value.startsWith('/') ? value : '/' + value);
  }

  function checkpointId(lesson) {
    return lesson.checkpoint_id || lesson.checkpointId || lesson.id;
  }

  function checkpointLabel(lesson) {
    return lesson.checkpoint_label || lesson.checkpointLabel ||
      (lesson.artifact
        ? 'I produced and checked: ' + lesson.artifact
        : 'I completed the lesson evidence check.');
  }

  function durationLabel(lesson) {
    if (lesson.duration) return lesson.duration;
    if (lesson.duration_minutes) return lesson.duration_minutes + ' min';
    return null;
  }

  function isCoreLesson(lesson) {
    if (lesson.required === false) return false;
    return (lesson.route || 'core') === 'core';
  }

  function courseLessons() {
    const source = window.BOOTCAMP_COURSE || {};
    return Array.isArray(source.lessons) ? source.lessons.filter(checkpointId) : [];
  }

  function courseCheckpoints() {
    const source = window.BOOTCAMP_COURSE || {};
    const milestones = Array.isArray(source.milestones) ? source.milestones.filter(checkpointId) : [];
    return courseLessons().concat(milestones);
  }

  function emptyState() {
    return { version: SCHEMA_VERSION, completed: [], tasks: [], updatedAt: null };
  }

  function sanitiseState(value) {
    const validIds = new Set(courseCheckpoints().map(checkpointId));
    const completed = Array.isArray(value && value.completed)
      ? value.completed.slice(0, MAX_PROGRESS_IDS).filter(id => validProgressId(id) && validIds.has(id))
      : [];
    const tasks = Array.isArray(value && value.tasks)
      ? value.tasks.slice(0, MAX_PROGRESS_IDS).filter(validProgressId)
      : [];
    return {
      version: SCHEMA_VERSION,
      completed: Array.from(new Set(completed)),
      tasks: Array.from(new Set(tasks)),
      updatedAt: typeof value?.updatedAt === 'string' && value.updatedAt.length <= 32 ? value.updatedAt : null
    };
  }

  function validProgressId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;
  }

  let databasePromise;
  let shownRevision = -1;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bootcamp-progress') : null;

  function database() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('bootcamp-progress', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('progress');
        request.onerror = () => { databasePromise = null; reject(request.error); };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); databasePromise = null; };
          resolve(db);
        };
      });
    }
    return databasePromise;
  }

  function legacyState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const legacy = saved ? null : localStorage.getItem(LEGACY_STORAGE_KEY);
      const text = saved || legacy;
      if (!text || text.length > MAX_PROGRESS_BYTES) return emptyState();
      const value = JSON.parse(text);
      return sanitiseState(saved ? value : {tasks: value.completed});
    } catch (error) {
      console.warn('Previous course progress could not be loaded.', error);
      return emptyState();
    }
  }

  // IndexedDB serializes read/write transactions across tabs. Migration, edits,
  // replacement imports, and resets all operate on this one authoritative row.
  async function transact(update) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('progress', 'readwrite');
      const store = transaction.objectStore('progress');
      const request = store.get('state');
      let result;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('Progress transaction aborted.'));
      request.onsuccess = () => {
        try {
          const previous = request.result;
          const state = previous || {...legacyState(), revision: 0};
          result = state;
          if (update) {
            result = {...sanitiseState(update(state)), updatedAt: new Date().toISOString(), revision: state.revision + 1};
          }
          if (update || !previous) store.put(result, 'state');
        } catch (error) { transaction.abort(); }
      };
    });
  }

  async function loadState() {
    return transact();
  }

  async function refreshProgress() {
    try { syncProgressUI(await loadState()); }
    catch (error) { console.warn('Course progress could not be loaded.', error); }
  }

  async function changeProgress(update) {
    try {
      const state = await transact(update);
      syncProgressUI(state);
      channel?.postMessage('changed');
      return state;
    } catch (error) {
      console.warn('Course progress could not be saved.', error);
      await refreshProgress();
      return null;
    }
  }

  function setCompletion(collection, id, completed) {
    return changeProgress(state => {
      const values = new Set(state[collection]);
      if (completed) values.add(id);
      else values.delete(id);
      return {...state, [collection]: Array.from(values)};
    });
  }

  function setCompleted(id, completed) {
    return setCompletion('completed', id, completed);
  }

  function setTaskCompleted(id, completed) {
    return setCompletion('tasks', id, completed);
  }

  function currentLesson() {
    const path = normalisePath(window.location.pathname);
    return courseLessons().find(lesson => {
      const candidate = lessonPath(lesson);
      return path === candidate || path.endsWith(candidate);
    }) || null;
  }

  function createMetaItem(label, value) {
    if (!value) return null;
    const item = document.createElement('div');
    item.className = 'lesson-contract-item';
    const term = document.createElement('span');
    term.className = 'lesson-contract-label';
    term.textContent = label;
    const detail = document.createElement('span');
    detail.textContent = value;
    item.append(term, detail);
    return item;
  }

  function addLessonContract(lesson) {
    if (!lesson || document.querySelector('.lesson-contract')) return;
    const title = document.querySelector('h1.title, .quarto-title h1');
    if (!title) return;

    const contract = document.createElement('section');
    contract.className = 'lesson-contract';
    contract.setAttribute('aria-label', 'Lesson plan');

    const eyebrow = document.createElement('p');
    eyebrow.className = 'lesson-contract-eyebrow';
    const route = lesson.route || 'core';
    const routeLabels = { core: 'Core path', full: 'Full-bootcamp path', reference: 'Reference path' };
    eyebrow.textContent = (lesson.status === 'optional' ? 'Optional · ' : '') +
      (routeLabels[route] || (route.charAt(0).toUpperCase() + route.slice(1) + ' path'));
    contract.appendChild(eyebrow);

    const grid = document.createElement('div');
    grid.className = 'lesson-contract-grid';
    [
      createMetaItem('Time', durationLabel(lesson)),
      createMetaItem('Compute', lesson.compute),
      createMetaItem('You will produce', lesson.artifact),
      createMetaItem('Completion check', checkpointLabel(lesson))
    ].filter(Boolean).forEach(item => grid.appendChild(item));
    contract.appendChild(grid);

    if (lesson.prerequisites) {
      const prereq = document.createElement('p');
      prereq.className = 'lesson-contract-prerequisites';
      const strong = document.createElement('strong');
      strong.textContent = 'Before you begin: ';
      prereq.append(strong, document.createTextNode(
        Array.isArray(lesson.prerequisites) ? lesson.prerequisites.join(' · ') : lesson.prerequisites
      ));
      contract.appendChild(prereq);
    }

    const insertionPoint = title.closest('#title-block-header, .quarto-title-block') || title;
    insertionPoint.insertAdjacentElement('afterend', contract);
  }

  function addMasteryCheckpoint(lesson, state) {
    if (!lesson || document.querySelector('.mastery-checkpoint')) return;
    const id = checkpointId(lesson);
    const main = document.querySelector('main') || document.querySelector('#quarto-content');
    if (!main) return;

    const section = document.createElement('section');
    section.className = 'mastery-checkpoint';
    section.setAttribute('aria-labelledby', 'mastery-checkpoint-title');

    const heading = document.createElement('h2');
    heading.id = 'mastery-checkpoint-title';
    heading.textContent = 'Complete this lesson';

    const help = document.createElement('p');
    help.textContent = 'Check this only after you can point to the evidence—not merely after reading the page.';

    const label = document.createElement('label');
    label.className = 'mastery-checkpoint-label';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'mastery-checkbox';
    checkbox.dataset.checkpointId = id;
    checkbox.checked = state.completed.includes(id);
    checkbox.addEventListener('change', () => setCompleted(id, checkbox.checked));
    const text = document.createElement('span');
    text.textContent = checkpointLabel(lesson);
    label.append(checkbox, text);

    section.append(heading, help, label);

    const lessons = courseLessons();
    const currentIndex = lessons.findIndex(item => checkpointId(item) === id);
    const following = currentIndex >= 0 ? lessons.slice(currentIndex + 1) : [];
    const next = isCoreLesson(lesson)
      ? following.find(isCoreLesson)
      : following[0];
    if (next) {
      const nextLink = document.createElement('a');
      nextLink.className = 'btn btn-primary mastery-next-link';
      nextLink.href = lessonPath(next);
      nextLink.textContent = 'Continue to ' + next.title;
      section.appendChild(nextLink);
    }

    const nav = main.querySelector('nav.page-navigation, .page-navigation, .module-nav');
    if (nav) nav.insertAdjacentElement('beforebegin', section);
    else main.appendChild(section);
  }

  function syncLegacyTaskCheckboxes(state) {
    const masteryIds = new Set(courseCheckpoints().map(checkpointId));
    const completed = new Set(state.completed);
    const tasks = new Set(state.tasks);
    document.querySelectorAll('.module-checkbox[data-module-id]').forEach(checkbox => {
      const id = checkbox.dataset.moduleId;
      const isMastery = masteryIds.has(id);
      checkbox.checked = isMastery ? completed.has(id) : tasks.has(id);
      if (!checkbox.dataset.progressBound) {
        checkbox.dataset.progressBound = 'true';
        checkbox.addEventListener('change', () => {
          if (isMastery) setCompleted(id, checkbox.checked);
          else setTaskCompleted(id, checkbox.checked);
        });
      }
    });
  }

  function syncProgressUI(state) {
    if (state.revision < shownRevision) return;
    shownRevision = state.revision;
    syncLegacyTaskCheckboxes(state);
    const checkpoints = courseCheckpoints();
    const core = checkpoints.filter(isCoreLesson);
    const optional = checkpoints.filter(lesson => !isCoreLesson(lesson));
    const completed = new Set(state.completed);
    const coreCompleted = core.filter(lesson => completed.has(checkpointId(lesson))).length;
    const optionalCompleted = optional.filter(lesson => completed.has(checkpointId(lesson))).length;
    const percent = core.length ? Math.round((coreCompleted / core.length) * 100) : 0;

    const bar = document.getElementById('progress-bar');
    const count = document.getElementById('completed-count');
    const total = document.getElementById('checkpoint-total');
    const optionalCount = document.getElementById('optional-completed-count');
    if (bar) {
      bar.style.width = percent + '%';
      bar.textContent = percent + '%';
      bar.setAttribute('aria-valuenow', String(percent));
    }
    if (count) count.textContent = String(coreCompleted);
    if (total) total.textContent = String(core.length);
    if (optionalCount) optionalCount.textContent = String(optionalCompleted);

    document.querySelectorAll('.mastery-checkbox[data-checkpoint-id]').forEach(checkbox => {
      checkbox.checked = completed.has(checkbox.dataset.checkpointId);
    });
  }

  function showResumeBanner() {
    const isHome = normalisePath(window.location.pathname) === '/index.html';
    if (!isHome) return;
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || 'null');
      if (!saved || !saved.path) {
        const banner = document.getElementById('resume-banner');
        if (banner) { banner.hidden = true; banner.style.display = 'none'; }
        return;
      }
      const banner = document.getElementById('resume-banner');
      const link = document.getElementById('resume-link');
      const title = document.getElementById('last-page-title');
      if (banner && link && title) {
        title.textContent = saved.day ? saved.day + ': ' + saved.title : saved.title;
        link.href = saved.path;
        banner.hidden = false;
        banner.style.display = '';
      }
    } catch (error) {
      console.warn('The resume link could not be restored.', error);
    }
  }

  function saveLastPage(lesson) {
    if (!lesson) return;
    try {
      localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({
        path: window.location.pathname,
        title: lesson.title || document.title,
        day: lesson.day || null,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('The resume link could not be saved.', error);
    }
  }

  async function exportProgress() {
    let state;
    try { state = await loadState(); }
    catch (error) { window.alert('Progress could not be loaded for export.'); return; }
    const blob = new Blob([JSON.stringify(sanitiseState(state), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ml-protein-bootcamp-progress.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function importProgress(file) {
    if (!file) return;
    if (file.size > MAX_PROGRESS_BYTES) {
      window.alert('Progress files must be 256 KiB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', async () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (!imported || typeof imported !== 'object' ||
            !Array.isArray(imported.completed) || !Array.isArray(imported.tasks) ||
            [imported.completed, imported.tasks].some(ids =>
              ids.length > MAX_PROGRESS_IDS || !ids.every(validProgressId))) {
          throw new Error('Progress export has the wrong shape.');
        }
        const saved = await changeProgress(() => imported);
        if (!saved) {
          window.alert('Progress could not be saved. Check browser storage settings or available space and try again.');
          return;
        }
        window.alert('Progress imported successfully.');
      } catch (error) {
        window.alert('That file is not a valid course progress export.');
      }
    });
    reader.addEventListener('error', () => window.alert('The progress file could not be read. Please try again.'));
    reader.addEventListener('abort', () => window.alert('Reading the progress file was canceled.'));
    reader.readAsText(file);
  }

  window.clearProgress = async function() {
    if (!window.confirm('Reset all saved course progress in this browser? This cannot be undone unless you exported a backup.')) return;
    const saved = await changeProgress(emptyState);
    if (!saved) { window.alert('Progress could not be reset. Check browser storage settings.'); return; }
    // Keep the empty authoritative row so old localStorage exports cannot revive it.
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LAST_PAGE_KEY);
    } catch (error) { console.warn('Old progress storage could not be cleared.', error); }
    showResumeBanner();
  };
  window.addEventListener('storage', event => {
    if (event.key === LAST_PAGE_KEY || event.key === null) showResumeBanner();
  });
  if (channel) channel.onmessage = refreshProgress;
  window.addEventListener('focus', refreshProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshProgress();
  });
  window.exportCourseProgress = exportProgress;
  window.importCourseProgress = importProgress;

  document.addEventListener('DOMContentLoaded', async function() {
    let state;
    try { state = await loadState(); }
    catch (error) {
      console.warn('Course progress storage is unavailable.', error);
      state = {...emptyState(), revision: 0};
    }
    const lesson = currentLesson();
    saveLastPage(lesson);
    showResumeBanner();
    addLessonContract(lesson);
    addMasteryCheckpoint(lesson, state);
    syncProgressUI(state);

    const exportButton = document.getElementById('export-progress');
    const importInput = document.getElementById('import-progress');
    if (exportButton) exportButton.addEventListener('click', exportProgress);
    if (importInput) importInput.addEventListener('change', event => importProgress(event.target.files[0]));
  });
})();
