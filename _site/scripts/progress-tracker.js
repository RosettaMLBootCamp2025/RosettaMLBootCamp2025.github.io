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
    return { version: SCHEMA_VERSION, completed: [], tasks: [], updatedAt: null, preferences: {route: 'core', compute: 'hosted', chosen: false} };
  }

  function sanitiseState(value) {
    const validIds = new Set(courseCheckpoints().map(checkpointId));
    const aliases = (window.BOOTCAMP_COURSE || {}).checkpoint_aliases || {};
    const completed = Array.isArray(value && value.completed)
      ? value.completed.slice(0, MAX_PROGRESS_IDS).map(id => aliases[id] || id).filter(id => validProgressId(id) && validIds.has(id))
      : [];
    const tasks = Array.isArray(value && value.tasks)
      ? value.tasks.slice(0, MAX_PROGRESS_IDS).filter(validProgressId)
      : [];
    return {
      version: SCHEMA_VERSION,
      completed: Array.from(new Set(completed.concat(tasks.map(id => aliases[id] || id).filter(id => validIds.has(id))))),
      tasks: Array.from(new Set(tasks.filter(id => !validIds.has(aliases[id] || id)))),
      preferences: validPreferences(value?.preferences),
      updatedAt: typeof value?.updatedAt === 'string' && value.updatedAt.length <= 32 ? value.updatedAt : null
    };
  }

  function validProgressId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;
  }

  let databasePromise;
  let currentState = {...emptyState(), revision: 0};
  let pendingUpdates = [];
  let retrying = false;
  let importGeneration = 0;
  let shownRevision = -1;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('bootcamp-progress') : null;

  function database() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('bootcamp-progress', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('progress');
        request.onblocked = () => { databasePromise = null; reject(new Error('Another course tab is blocking storage.')); };
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
    if (!courseLessons().length) throw new Error('Course lesson data is unavailable.');
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
          const state = previous ? {...previous, ...sanitiseState(previous)} : {...legacyState(), revision: 0};
          result = state;
          if (update) {
            const changed = update(state);
            result = {...sanitiseState(changed), undo: changed.undo || null, updatedAt: new Date().toISOString(), revision: state.revision + 1};
          }
          if (update || !previous) store.put(result, 'state');
        } catch (error) { transaction.abort(); }
      };
    });
  }

  async function loadState() {
    return transact();
  }

  function notify(message, error = false) {
    let region = document.getElementById('progress-notice');
    if (!region) {
      region = document.createElement('section');
      region.id = 'progress-notice';
      region.setAttribute('aria-label', 'Progress storage');
      region.innerHTML = '<p role="status" aria-live="polite"></p><div class="progress-recovery" hidden><button type="button" class="btn btn-primary btn-sm">Retry saving</button> <button type="button" class="btn btn-outline-primary btn-sm">Download backup</button></div>';
      (document.querySelector('main') || document.body).prepend(region);
      const buttons = region.querySelectorAll('button');
      buttons[0].addEventListener('click', retryPending);
      buttons[1].addEventListener('click', exportProgress);
    }
    region.className = error ? 'progress-notice progress-notice-error' : 'progress-notice';
    region.querySelector('p').textContent = message;
    region.querySelector('.progress-recovery').hidden = !error;
  }

  async function refreshProgress() {
    if (!courseLessons().length) return;
    if (pendingUpdates.length || retrying) return;
    try { syncProgressUI(await loadState()); }
    catch (error) { notify('Progress storage is unavailable. Changes will stay in this tab until you retry or download a backup.', true); }
  }

  async function changeProgress(update) {
    if (pendingUpdates.length) {
      pendingUpdates.push(update);
      syncProgressUI({...update(currentState), revision: currentState.revision});
      notify('Your progress is not saved yet. Keep this tab open and retry, or download a backup.', true);
      return null;
    }
    try {
      const state = await transact(update);
      syncProgressUI(pendingUpdates.reduce((value, pending) => pending(value), state));
      channel?.postMessage('changed');
      notify(pendingUpdates.length ? 'Some changes are not saved yet. Retry saving or download a backup.' : 'Progress saved in this browser.', Boolean(pendingUpdates.length));
      return state;
    } catch (error) {
      pendingUpdates.push(update);
      syncProgressUI({...update(currentState), revision: currentState.revision});
      notify('Your progress could not be saved. Changes are kept in this tab. Retry saving or download a backup before leaving.', true);
      return null;
    }
  }

  async function retryPending() {
    if (retrying) return;
    retrying = true;
    const batch = pendingUpdates.slice();
    try {
      const state = await transact(state => batch.reduce((value, update) => update(value), state));
      pendingUpdates.splice(0, batch.length);
      syncProgressUI(pendingUpdates.reduce((value, update) => update(value), state));
      channel?.postMessage('changed');
      notify(pendingUpdates.length ? 'Some changes still need saving. Retry again.' : 'All progress saved in this browser.', Boolean(pendingUpdates.length));
    } catch (error) {
      notify('Progress still could not be saved. Check browser storage settings or download a backup.', true);
    } finally { retrying = false; }
  }

  function setCompletion(collection, id, completed) {
    return changeProgress(state => {
      const values = new Set(state[collection]);
      if (completed) values.add(id);
      else values.delete(id);
      const undo = state.undo ? {...state.undo, touched: [...new Set([...(state.undo.touched || []), collection + ':' + id])]} : null;
      return {...state, undo, [collection]: Array.from(values)};
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

    const nextLink = document.createElement('a');
    nextLink.className = 'btn btn-primary mastery-next-link';
    section.appendChild(nextLink);

    const nav = main.querySelector('nav.page-navigation, .page-navigation, .module-nav');
    if (nav) nav.insertAdjacentElement('beforebegin', section);
    else main.appendChild(section);
  }

  function syncLegacyTaskCheckboxes(state) {
    const masteryIds = new Set(courseCheckpoints().map(checkpointId));
    const completed = new Set(state.completed);
    const tasks = new Set(state.tasks);
    document.querySelectorAll('.module-checkbox[data-module-id]').forEach(checkbox => {
      const originalId = checkbox.dataset.moduleId;
      const id = (window.BOOTCAMP_COURSE.checkpoint_aliases || {})[originalId] || originalId;
      const isMastery = masteryIds.has(id);
      checkbox.closest('label')?.setAttribute('data-evidence-kind', isMastery ? 'evidence' : 'practice');
      const label = checkbox.closest('label');
      if (label && !label.querySelector('.task-kind')) {
        const badge = document.createElement('small');
        badge.className = 'task-kind';
        badge.textContent = isMastery ? 'Evidence checkpoint' : 'Practice step · not counted';
        label.appendChild(badge);
      }
      const item = courseCheckpoints().find(item => checkpointId(item) === id);
      const badge = label?.querySelector('.task-kind');
      if (badge && item) badge.textContent = requiredForRoute(item, state.preferences) ? 'Required evidence' : 'Optional evidence for this path';
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
    currentState = state;
    syncLegacyTaskCheckboxes(state);
    const checkpoints = courseCheckpoints();
    const core = checkpoints.filter(item => requiredForRoute(item, state.preferences));
    const optional = checkpoints.filter(item => !requiredForRoute(item, state.preferences));
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
    if (count) {
      count.textContent = String(coreCompleted);
      count.parentElement.parentElement.hidden = state.preferences.route === 'reference';
    }
    if (bar) bar.parentElement.hidden = state.preferences.route === 'reference';
    if (total) total.textContent = String(core.length);
    if (optionalCount) optionalCount.textContent = String(optionalCompleted);
    renderJourney(state, core);

    document.querySelectorAll('.mastery-checkbox[data-checkpoint-id]').forEach(checkbox => {
      checkbox.checked = completed.has(checkbox.dataset.checkpointId);
    });
  }

  function validPreferences(value) {
    return {
      route: ['core', 'full', 'reference'].includes(value?.route) ? value.route : 'core',
      compute: ['hosted', 'local', 'analysis'].includes(value?.compute) ? value.compute : 'hosted',
      chosen: value?.chosen === true
    };
  }

  function requiredForRoute(item, preferences = currentState.preferences) {
    const prefs = validPreferences(preferences);
    if (prefs.route === 'reference' || item.path?.includes('/targets/') || item.id === 'capstone-exemplar') return false;
    if (item.compute_modes && !item.compute_modes.includes(prefs.compute)) return false;
    return prefs.route === 'full' || isCoreLesson(item);
  }

  function routeLessons(state = currentState) {
    return courseLessons().filter(item => requiredForRoute(item, state.preferences));
  }

  function activeWork() {
    try {
      const saved = JSON.parse(localStorage.getItem('bootcamp-active-work') || 'null');
      const lesson = saved && courseLessons().find(item => checkpointId(item) === saved.id);
      if (!lesson || (currentState.preferences.route !== 'reference' && !requiredForRoute(lesson)) || currentState.completed.includes(saved.id)) return null;
      const hash = typeof saved.hash === 'string' && /^#[a-zA-Z0-9_.:-]+$/.test(saved.hash) ? saved.hash : '';
      return {lesson, hash};
    } catch (error) { return null; }
  }

  function startWork(lesson, hash = '') {
    try { localStorage.setItem('bootcamp-active-work', JSON.stringify({id: checkpointId(lesson), hash})); }
    catch (error) { /* Resume is optional; evidence saving has its own recovery. */ }
  }

  function evidenceLink(item, state) {
    const link = document.createElement('a');
    link.href = lessonPath(item);
    const done = state.completed.includes(checkpointId(item));
    link.textContent = (done ? '✓ Complete: ' : 'To do: ') + (item.title || checkpointLabel(item));
    link.addEventListener('click', () => startWork(item));
    return link;
  }

  function makeMobileCards() {
    const heading = document.getElementById('tool-installation-map');
    const table = heading?.querySelector('table');
    if (!table) return;
    const cards = document.createElement('div');
    cards.className = 'mobile-tool-cards';
    const headers = [...table.querySelectorAll('thead th')].map(item => item.textContent.trim());
    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = [...row.querySelectorAll('td')];
      const card = document.createElement('article');
      card.className = 'mobile-tool-card';
      const title = document.createElement('h3');
      title.append(...[...cells[0].childNodes].map(node => node.cloneNode(true)));
      card.appendChild(title);
      const list = document.createElement('dl');
      for (let i = 1; i < cells.length; i++) {
        const term = document.createElement('dt'); term.textContent = headers[i];
        const value = document.createElement('dd'); value.textContent = cells[i].textContent;
        list.append(term, value);
      }
      card.appendChild(list); cards.appendChild(card);
    }
    table.classList.add('desktop-tool-table');
    table.after(cards);
  }

  function setupJourney() {
    makeMobileCards();
    const panel = document.getElementById('route-picker');
    if (panel) {
      panel.innerHTML = '<form id="route-form"><fieldset><legend>Your learning path</legend><div class="route-fields"><label for="learning-route">Route<select id="learning-route" name="route"><option value="core">Core — recommended</option><option value="full">Full bootcamp</option><option value="reference">Reference — explore freely</option></select></label><label for="compute-mode">Available compute<select id="compute-mode" name="compute"><option value="hosted">Hosted notebooks</option><option value="local">Local GPU / HPC</option><option value="analysis">Analyze supplied examples</option></select></label></div><p class="small">You can change these choices anytime. Existing evidence stays saved. Local tool installations are included only for the local GPU route.</p><button class="btn btn-primary" type="submit">Save my learning path</button><p id="route-saved" role="status"></p></fieldset></form>';
      panel.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const preferences = {route: panel.querySelector('[name="route"]').value, compute: panel.querySelector('[name="compute"]').value, chosen: true};
        try { localStorage.removeItem('bootcamp-active-work'); } catch (error) { /* optional history */ }
        const state = await changeProgress(state => ({...state, preferences}));
        document.getElementById('route-saved').textContent = state ? 'Learning path saved. Your next step is below.' : 'Path selected for this tab. Retry saving or download a backup.';
      });
    }
    const main = document.querySelector('main');
    if (!main) return;
    const plan = document.createElement('section');
    plan.id = 'learning-plan';
    plan.setAttribute('aria-label', 'Your learning plan');
    plan.innerHTML = '<p class="journey-context"></p><p class="journey-next"></p><details class="journey-list"><summary>View your learning path and remaining evidence</summary><div></div></details><button type="button" id="short-session" class="btn btn-outline-primary btn-sm">I have 20 minutes</button><div id="short-session-result" role="status"></div>';
    const title = document.getElementById('title-block-header');
    if (panel) panel.insertAdjacentElement('afterend', plan);
    else if (title) title.insertAdjacentElement('afterend', plan);
    else main.prepend(plan);
    document.getElementById('short-session').addEventListener('click', () => {
      const activities = window.BOOTCAMP_COURSE.short_activities || [];
      const activity = activities.find(item => !currentState.completed.includes(item.checkpoint_id) && !currentState.tasks.includes(item.id));
      const result = document.getElementById('short-session-result');
      result.replaceChildren();
      const text = document.createElement('p');
      if (!activity) { text.textContent = 'All short activities are done. Revisit your evidence list to improve one artifact or explore a reference lesson.'; result.appendChild(text); return; }
      text.textContent = activity.minutes + ' minutes · ' + activity.instruction;
      const link = document.createElement('a');
      link.href = '/' + activity.path;
      link.textContent = activity.title;
      const label = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.addEventListener('change', () => setTaskCompleted(activity.id, check.checked));
      label.append(check, document.createTextNode(' I finished this short practice step (lesson evidence stays separate).'));
      result.append(link, text, label);
    });
    // Only an explicitly active lesson updates the resume section. Browsing references cannot replace it.
    const lesson = currentLesson();
    if (lesson && !['capstone-rubric', 'capstone-exemplar'].includes(lesson.id)) {
      const button = document.createElement('button');
      button.className = 'btn btn-link btn-sm';
      button.type = 'button';
      button.textContent = 'Work on this lesson';
      button.addEventListener('click', () => { startWork(lesson, location.hash); notify('This lesson is your active work. Your place will be remembered as you scroll.'); });
      plan.appendChild(button);
      let scheduled = false;
      window.addEventListener('scroll', () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          const active = activeWork();
          if (active?.lesson.id !== lesson.id) return;
          const headings = [...main.querySelectorAll('section[id] > h2, section[id] > h3')];
          const heading = headings.filter(item => item.getBoundingClientRect().top < innerHeight * 0.45).pop();
          if (heading) startWork(lesson, '#' + heading.parentElement.id);
        });
      }, {passive: true});
    }
  }

  function renderJourney(state, required) {
    const prefs = validPreferences(state.preferences);
    const routeNames = {core: 'Core', full: 'Full bootcamp', reference: 'Reference'};
    const computeNames = {hosted: 'Hosted notebooks', local: 'Local GPU / HPC', analysis: 'Analyze supplied examples'};
    const plan = document.getElementById('learning-plan');
    if (!plan) return;
    const context = plan.querySelector('.journey-context');
    context.replaceChildren(document.createTextNode(routeNames[prefs.route] + ' · ' + computeNames[prefs.compute] + (prefs.chosen ? ' · ' : ' · Recommended default · ')));
    const change = document.createElement('a');
    change.href = '/start-here.html#route-picker';
    change.textContent = 'Change route';
    context.appendChild(change);
    const form = document.getElementById('route-form');
    if (form && !form.contains(document.activeElement)) {
      form.elements.route.value = prefs.route;
      form.elements.compute.value = prefs.compute;
    }
    const remaining = routeLessons(state).filter(item => !state.completed.includes(checkpointId(item)));
    const active = activeWork();
    const next = active?.lesson || remaining[0];
    const nextArea = plan.querySelector('.journey-next');
    nextArea.replaceChildren();
    if (next) {
      const link = document.createElement('a');
      link.className = 'btn btn-primary';
      link.href = lessonPath(next) + (active?.hash || '');
      link.textContent = (active ? 'Resume: ' : 'Next: ') + next.title;
      link.addEventListener('click', () => startWork(next, active?.hash || ''));
      nextArea.appendChild(link);
    } else {
      nextArea.textContent = prefs.route === 'reference' ? 'Explore any lesson. There is no required sequence on the reference route.' : required.every(item => state.completed.includes(checkpointId(item))) ? 'Your required evidence is complete. Review your portfolio and choose the next research question.' : 'Lesson checks are complete. Finish the remaining evidence listed below.';
    }
    const list = plan.querySelector('.journey-list > div');
    list.replaceChildren();
    const currentDay = location.pathname.match(/\/(monday|tuesday|wednesday|thursday|capstone)\//)?.[1];
    const items = prefs.route === 'reference' ? courseCheckpoints().filter(item => state.completed.includes(checkpointId(item))) : required;
    for (const day of ['monday','tuesday','wednesday','thursday','capstone']) {
      const dayItems = items.filter(item => item.day === day || (day === 'monday' && item.day === 'prework'));
      if (!dayItems.length) continue;
      const group = document.createElement('div');
      const heading = document.createElement('p');
      heading.className = 'evidence-day-count';
      heading.textContent = day.charAt(0).toUpperCase() + day.slice(1) + ': ' + dayItems.filter(item => state.completed.includes(checkpointId(item))).length + ' of ' + dayItems.length + ' evidence checkpoints complete';
      group.appendChild(heading);
      const links = document.createElement('ul');
      for (const item of dayItems) { const li = document.createElement('li'); li.appendChild(evidenceLink(item, state)); links.appendChild(li); }
      group.appendChild(links); list.appendChild(group);
      if (day === currentDay) {
        let counter = document.getElementById('day-evidence-count');
        if (!counter) { counter = document.createElement('p'); counter.id = 'day-evidence-count'; counter.setAttribute('role', 'status'); plan.prepend(counter); }
        counter.textContent = heading.textContent;
      }
    }
    if (prefs.route === 'reference' && !items.length) list.textContent = 'No evidence saved yet. Use the day navigation or search to open a lesson.';
    if (prefs.route === 'reference') document.getElementById('day-evidence-count')?.remove();
    const current = currentLesson();
    const following = current ? courseLessons().slice(courseLessons().indexOf(current) + 1).find(item => requiredForRoute(item, prefs) && !state.completed.includes(checkpointId(item))) : null;
    document.querySelectorAll('.mastery-next-link').forEach(link => {
      link.href = following ? lessonPath(following) : '/index.html#learning-plan';
      link.textContent = following ? 'Continue to ' + following.title : 'Review your learning path';
      link.onclick = () => { if (following) startWork(following); };
    });
    document.querySelectorAll('#quarto-sidebar a[href]').forEach(link => {
      const item = courseLessons().find(item => normalisePath(new URL(link.href).pathname) === lessonPath(item));
      if (!item) return;
      link.dataset.routeStatus = requiredForRoute(item, prefs) ? 'required' : 'optional';
      link.title = requiredForRoute(item, prefs) ? 'In your learning path' : 'Optional for your current path';
    });
    const checkpoint = document.querySelector('.mastery-checkpoint');
    if (checkpoint && current) {
      checkpoint.querySelector('h2').textContent = requiredForRoute(current, prefs) ? 'Save required lesson evidence' : 'Save optional lesson evidence';
    }
    let alternative = document.getElementById('analysis-route-link');
    if (current?.analysis_href && prefs.compute !== 'local') {
      if (!alternative) { alternative = document.createElement('p'); alternative.id = 'analysis-route-link'; plan.appendChild(alternative); }
      alternative.replaceChildren(document.createTextNode('No compute available? '));
      const link = document.createElement('a'); link.href = '/' + current.analysis_href;
      link.textContent = 'Open the supplied analysis dataset and instructions'; alternative.appendChild(link);
    } else alternative?.remove();
    let undo = document.getElementById('undo-progress');
    if (state.undo && !undo) {
      undo = document.createElement('button'); undo.id = 'undo-progress'; undo.type = 'button'; undo.className = 'btn btn-outline-primary btn-sm';
      undo.addEventListener('click', undoProgress);
      (document.getElementById('manage-progress') || plan).appendChild(undo);
    }
    if (undo) { undo.hidden = !state.undo; if (state.undo) undo.textContent = 'Undo last ' + state.undo.label; }
    const note = document.getElementById('progress-route-note');
    if (note) note.textContent = prefs.route === 'reference' ? 'Reference route: no required sequence. Saved checkpoints appear in your evidence list.' : 'Required evidence for your ' + routeNames[prefs.route].toLowerCase() + ' path using ' + computeNames[prefs.compute].toLowerCase() + '.';
  }

  function showResumeBanner() {
    if (normalisePath(location.pathname) !== '/index.html') return;
    try {
      const saved = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || 'null');
      if (!saved || !saved.path) {
        const banner = document.getElementById('resume-banner');
        if (banner) { banner.hidden = true; banner.style.display = 'none'; }
        return;
      }
      const lesson = saved && courseLessons().find(item => lessonPath(item) === normalisePath(saved.path));
      if (!lesson) {
        const banner = document.getElementById('resume-banner');
        if (banner) { banner.hidden = true; banner.style.display = 'none'; }
        return;
      }
      const banner = document.getElementById('resume-banner');
      if (!banner) return;
      document.getElementById('last-page-title').textContent = lesson.title;
      document.getElementById('resume-link').href = lessonPath(lesson);
      document.getElementById('resume-link').textContent = 'Open last viewed page';
      banner.style.display = '';
    } catch (error) { /* Last-viewed history is optional. */ }
  }

  function saveLastPage(lesson) {
    if (!lesson) return;
    try { localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({path: lessonPath(lesson), timestamp: Date.now()})); }
    catch (error) { /* Course progress remains independent of browsing history. */ }
  }

  async function exportProgress() {
    let state;
    try { state = pendingUpdates.length ? currentState : await loadState(); }
    catch (error) { state = currentState; }
    const blob = new Blob([JSON.stringify(sanitiseState(state), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ml-protein-bootcamp-progress.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }

  function backupChange(state, changed, label) {
    return {...state, ...changed, undo: {label, before: {completed: state.completed, tasks: state.tasks}, after: changed, touched: []}};
  }

  async function undoProgress() {
    await changeProgress(state => {
      const undo = state.undo;
      if (!undo) return state;
      const restored = {...state, undo: null};
      for (const collection of ['completed', 'tasks']) {
        const values = new Set(state[collection]);
        const before = new Set(undo.before[collection]);
        const after = new Set(undo.after[collection]);
        for (const id of new Set([...before, ...after])) {
          if (before.has(id) === after.has(id) || undo.touched.includes(collection + ':' + id)) continue;
          if (before.has(id)) values.add(id); else values.delete(id);
        }
        restored[collection] = [...values];
      }
      return restored;
    });
  }

  function importProgress(file) {
    const generation = ++importGeneration;
    document.getElementById('import-preview')?.remove();
    if (!file) return;
    if (file.size > MAX_PROGRESS_BYTES) { notify('Progress files must be 256 KiB or smaller. Choose a course progress backup.'); return; }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (generation !== importGeneration) return;
      try {
        const imported = JSON.parse(String(reader.result));
        if (!imported || typeof imported !== 'object' || !Array.isArray(imported.completed) || !Array.isArray(imported.tasks) ||
            [imported.completed, imported.tasks].some(ids => ids.length > MAX_PROGRESS_IDS || !ids.every(validProgressId)) ||
            (imported.version !== undefined && imported.version !== SCHEMA_VERSION)) throw new Error('Invalid export');
        const clean = sanitiseState(imported);
        const preview = document.createElement('section');
        preview.id = 'import-preview';
        preview.setAttribute('aria-label', 'Preview progress import');
        preview.tabIndex = -1;
        const message = document.createElement('p');
        const unknown = imported.completed.filter(id => !clean.completed.includes((window.BOOTCAMP_COURSE.checkpoint_aliases || {})[id] || id)).length;
        message.textContent = 'This backup contains ' + clean.completed.length + ' evidence checkpoints; this browser currently has ' + currentState.completed.length + '. Merge keeps existing checks. Replace uses only the backup. Your route stays unchanged.' + (unknown ? ' ' + unknown + ' unrecognized checkpoints will be ignored.' : '');
        preview.appendChild(message);
        for (const [mode, title] of [['merge', 'Merge progress'], ['replace', 'Replace progress'], ['cancel', 'Cancel']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-sm ' + (mode === 'merge' ? 'btn-primary' : 'btn-outline-secondary');
          button.textContent = title;
          button.addEventListener('click', async () => {
            preview.querySelectorAll('button').forEach(item => { item.disabled = true; });
            if (mode !== 'cancel') {
              await changeProgress(state => {
                const changed = {};
                for (const key of ['completed', 'tasks']) changed[key] = mode === 'merge' ? [...new Set([...state[key], ...clean[key]])] : clean[key];
                return backupChange(state, changed, mode === 'merge' ? 'merge' : 'replacement');
              });
            }
            preview.remove();
            const input = document.getElementById('import-progress');
            if (input) { input.value = ''; input.focus(); }
          });
          preview.appendChild(button);
        }
        const host = document.getElementById('manage-progress') || document.querySelector('main');
        host.appendChild(preview);
        if (host.tagName === 'DETAILS') host.open = true;
        preview.focus();
      } catch (error) { notify('That file is not a valid course progress export. Choose a JSON backup downloaded from this course.'); }
    });
    reader.addEventListener('error', () => notify('The progress file could not be read. Choose the file again.'));
    reader.addEventListener('abort', () => notify('Reading the progress file was canceled. Your progress is unchanged.'));
    reader.readAsText(file);
  }

  window.clearProgress = async function() {
    if (!window.confirm('Reset all completed evidence and practice steps? You can undo this reset in Manage progress. Your route will stay unchanged.')) return;
    const saved = await changeProgress(state => backupChange(state, {completed: [], tasks: []}, 'reset'));
    if (!saved) return;
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
  window.addEventListener('beforeunload', event => {
    if (pendingUpdates.length) { event.preventDefault(); event.returnValue = ''; }
  });
  if (channel) channel.onmessage = refreshProgress;
  window.addEventListener('focus', refreshProgress);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshProgress();
  });
  window.exportCourseProgress = exportProgress;
  window.importCourseProgress = importProgress;

  document.addEventListener('DOMContentLoaded', async function() {
    if (!courseLessons().length) {
      notify('The course navigation could not load. Reload this page to try again. Your saved progress has not been changed.');
      return;
    }
    let state;
    notify('Loading saved progress…');
    try { state = await loadState(); document.getElementById('progress-notice')?.remove(); }
    catch (error) {
      console.warn('Course progress storage is unavailable.', error);
      state = {...emptyState(), revision: 0};
      notify('Progress storage is unavailable. Keep this tab open and download a backup before leaving.', true);
    }
    setupJourney();
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
