(function () {
  'use strict';

  const STORAGE_KEY = 'rb_kids_scratchjr_program_v1';
  const FLOATING_KEY = 'rb_kids_scratchjr_floating_v1';
  const POSITION_KEY = 'rb_kids_scratchjr_position_v1';
  const ZOOM_KEY = 'rb_kids_scratchjr_zoom_v1';
  const PAN_KEY = 'rb_kids_scratchjr_pan_v1';
  const IS_DEMO = new URLSearchParams(location.search).has('kids-demo');
  const defs = {
    start:       {category:'start', shape:'start', ico:'flag', title:'Почати програму'},
    forward:     {category:'move', shape:'blue', ico:'forward', title:'Їхати вперед', param:2, suffix:'с'},
    back:        {category:'move', shape:'blue', ico:'back', title:'Їхати назад', param:2, suffix:'с'},
    left:        {category:'move', shape:'blue', ico:'left', title:'Повернути ліворуч', param:90, suffix:'°'},
    right:       {category:'move', shape:'blue', ico:'right', title:'Повернути праворуч', param:90, suffix:'°'},
    uturn:       {category:'move', shape:'blue', ico:'uturn', title:'Розвернутися'},
    slow:        {category:'move', shape:'blue', ico:'slow', title:'Повільна швидкість'},
    fast:        {category:'move', shape:'blue', ico:'fast', title:'Швидка швидкість'},
    drive_time:  {category:'move', shape:'blue', ico:'drivetime', title:'Їхати протягом часу', param:2, suffix:'с'},
    motor_stop:  {category:'move', shape:'blue', ico:'stopb', title:'Зупинити мотори'},
    sensor_wait: {category:'sensor', shape:'orange', ico:'senseobst', title:'Чекати, поки датчик 1 покаже більше за число', param:50, suffix:''},
    wait:        {category:'actions', shape:'green', ico:'wait', title:'Почекати', param:1, suffix:'с'},
    smile:       {category:'actions', shape:'green', ico:'smile', title:'Показати смайлик'},
    say:         {category:'actions', shape:'green', ico:'say', title:'Показати текст на екрані', param:'HI', suffix:''},
    clear:       {category:'actions', shape:'green', ico:'clear', title:'Очистити екран'},
    repeat:      {category:'repeat', shape:'purple', ico:'repeat', title:'Повторити вкладені блоки', param:3, suffix:'', container:true},
    end:         {category:'end', shape:'end', ico:'stop', title:'Кінець програми'}
  };
  const categories = [
    {id:'start', icon:'🏁', label:'Старт', color:'#f7c600', blocks:['start']},
    {id:'move', icon:'➡️', label:'Рух', color:'#298cee', blocks:['forward','back','left','right','uturn','slow','fast','drive_time','motor_stop']},
    {id:'sensor', icon:'👀', label:'Датчик', color:'#f38d1b', blocks:['sensor_wait']},
    {id:'actions', icon:'🙂', label:'Дії', color:'#46bb42', blocks:['wait','smile','say','clear']},
    {id:'repeat', icon:'🔁', label:'Цикл', color:'#9d4edd', blocks:['repeat']},
    {id:'end', icon:'🛑', label:'Кінець', color:'#e83a3a', blocks:['end']}
  ];

  const sample = [
    {id:'sample-start', type:'start'},
    {id:'sample-repeat', type:'repeat', param:3, children:[
      {id:'sample-forward', type:'forward', param:2},
      {id:'sample-right', type:'right', param:90},
      {id:'sample-smile', type:'smile'}
    ]},
    {id:'sample-say', type:'say', param:'HI'},
    {id:'sample-end', type:'end'}
  ];
  let program = sample;
  let floatingBlocks = [];
  let programPosition = {x:40, y:Math.max(100, Math.round(innerHeight / 2 - 40))};
  let kidsZoom = 1;
  let viewPan = {x:0, y:0};
  if (!IS_DEMO) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(saved)) program = saved;
      const floating = JSON.parse(localStorage.getItem(FLOATING_KEY));
      if (Array.isArray(floating)) floatingBlocks = floating;
      const position = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) programPosition = position;
      const zoom = Number(localStorage.getItem(ZOOM_KEY));
      if (Number.isFinite(zoom) && zoom >= .55 && zoom <= 1.5) kidsZoom = zoom;
      const pan = JSON.parse(localStorage.getItem(PAN_KEY));
      if (Number.isFinite(pan?.x) && Number.isFinite(pan?.y)) viewPan = pan;
      else viewPan = {x:(1 - kidsZoom) * programPosition.x, y:(1 - kidsZoom) * programPosition.y};
    } catch (_) {}
  }
  let activeLoopId = null;
  let activeCategory = 'move';
  let kidsMode = false;
  let nextId = 0;
  let completedDrag = false;
  let normalWorkspaceBackup = null;
  let zoomCommitTimer = null;
  const undoStack = [];
  const redoStack = [];

  const byId = id => document.getElementById(id);
  const newId = () => 'kids-' + Date.now() + '-' + (++nextId);
  const snapshot = () => JSON.stringify({program, floatingBlocks, programPosition, activeLoopId, kidsZoom, viewPan});
  let lastSnapshot = snapshot();

  function updateHistoryButtons() {
    const undo = byId('kidsUndoBtn');
    const redo = byId('kidsRedoBtn');
    if (undo) undo.disabled = undoStack.length === 0;
    if (redo) redo.disabled = redoStack.length === 0;
  }

  function persist() { if (IS_DEMO) return; try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(program));
    localStorage.setItem(FLOATING_KEY, JSON.stringify(floatingBlocks));
    localStorage.setItem(POSITION_KEY, JSON.stringify(programPosition));
    localStorage.setItem(ZOOM_KEY, String(kidsZoom));
    localStorage.setItem(PAN_KEY, JSON.stringify(viewPan));
  } catch (_) {} };

  function save() {
    const current = snapshot();
    if (current === lastSnapshot) return;
    undoStack.push(lastSnapshot);
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = current;
    persist();
    updateHistoryButtons();
  }

  function restoreSnapshot(value) {
    const state = JSON.parse(value);
    program = state.program;
    floatingBlocks = state.floatingBlocks;
    programPosition = state.programPosition;
    activeLoopId = state.activeLoopId;
    kidsZoom = state.kidsZoom ?? 1;
    viewPan = state.viewPan ?? {x:0, y:0};
    lastSnapshot = value;
    persist();
    renderSequence();
    updateHistoryButtons();
  }

  window.kidsUndo = function () {
    if (!undoStack.length) return;
    redoStack.push(lastSnapshot);
    restoreSnapshot(undoStack.pop());
  };

  window.kidsRedo = function () {
    if (!redoStack.length) return;
    undoStack.push(lastSnapshot);
    restoreSnapshot(redoStack.pop());
  };

  function newNode(type) {
    const def = defs[type];
    const node = {id:newId(), type};
    if (def.param !== undefined) node.param = def.param;
    if (def.container) node.children = [];
    return node;
  }

  function getWorkspace() {
    try { if (window.workspace) return window.workspace; } catch (_) {}
    try { return window.Blockly && Blockly.getMainWorkspace && Blockly.getMainWorkspace(); } catch (_) {}
    return null;
  }

  function findLocation(id, list = program, parentId = null) {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      if (node.id === id) return {node, list, index, parentId};
      if (Array.isArray(node.children)) {
        const child = findLocation(id, node.children, node.id);
        if (child) return child;
      }
    }
    if (list === program) return findLocation(id, floatingBlocks, null);
    return null;
  }

  function containsId(node, id) {
    if (node.id === id) return true;
    return Array.isArray(node.children) && node.children.some(child => containsId(child, id));
  }

  function editParam(node, event) {
    event.stopPropagation();
    const def = defs[node.type];
    if (!def || def.param === undefined) return;
    const input = prompt(def.title + '\nНове значення:', node.param ?? def.param);
    if (input === null) return;
    const value = input.trim();
    if (!value) return;
    if (node.type === 'say') node.param = value.slice(0, 24);
    else {
      const number = Number(value.replace(',', '.'));
      if (!Number.isFinite(number)) return;
      node.param = Math.max(0, Math.min(node.type === 'repeat' ? 99 : 999, number));
    }
    save();
    renderSequence();
  }

  function makeChip(node) {
    const def = defs[node.type];
    if (def.param === undefined) return null;
    const chip = document.createElement('button');
    chip.className = 'kids-jr-param';
    chip.type = 'button';
    chip.textContent = String(node.param ?? def.param) + (def.suffix || '');
    chip.title = 'Натисни, щоб змінити значення';
    if (node.id) chip.addEventListener('click', event => editParam(node, event));
    else chip.addEventListener('click', event => event.stopPropagation());
    return chip;
  }

  function makeIcon(name) {
    const icon = document.createElement('div');
    icon.className = 'kids-jr-icon ico-' + name;
    return icon;
  }

  function makeRemove(node) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'kids-jr-remove';
    button.title = 'Прибрати блок';
    button.textContent = '×';
    button.addEventListener('click', event => {
      event.stopPropagation();
      const location = findLocation(node.id);
      if (!location) return;
      location.list.splice(location.index, 1);
      if (activeLoopId && containsId(node, activeLoopId)) activeLoopId = location.parentId;
      save();
      renderSequence();
    });
    return button;
  }

  function attachDrag(element, node, palette) {
    element.draggable = true;
    let dragPayload;
    element.addEventListener('dragstart', event => {
      event.stopPropagation();
      completedDrag = false;
      const rect = element.getBoundingClientRect();
      dragPayload = {
        ...(palette ? {kind:'palette', type:node.type} : {kind:'sequence', id:node.id}),
        grabX:rect.width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : .5,
        grabY:rect.height ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : .5,
        width:rect.width,
        height:rect.height
      };
      event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload));
      event.dataTransfer.effectAllowed = palette ? 'copyMove' : 'move';
    });
    element.addEventListener('dragend', event => {
      if (completedDrag || !kidsMode) return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const sequence = byId('kidsSequence');
      const builder = byId('view-builder');
      if (!target || !builder?.contains(target) || target.closest('#kidsPaletteDock')) return;
      if (sequence?.contains(target)) {
        const nest = target.closest('.kids-jr-loop-nest');
        const container = nest || sequence;
        const loopId = nest?.closest('.kids-jr-loop')?.dataset.kidsId || null;
        if (palette) insertPaletteBlock(node.type, container, loopId, target, event.clientX);
        else moveNodeIntoList(node.id, container, loopId, target, event.clientX);
      } else dropNearChainOrCanvas(dragPayload || (palette ? {kind:'palette', type:node.type} : {kind:'sequence', id:node.id}), event);
    });
  }

  function makeSimple(node, palette) {
    const def = defs[node.type];
    const block = document.createElement('div');
    block.className = 'kids-jr-block shape-' + def.shape + (def.shape === 'start' ? ' wide' : '') + (palette ? ' in-tray' : ' kids-sequence-block');
    block.dataset.kidsType = node.type;
    if (node.id) block.dataset.kidsId = node.id;
    block.title = def.title;
    block.appendChild(makeIcon(def.ico));
    const chip = makeChip(node);
    if (chip) block.appendChild(chip);
    if (!palette) block.appendChild(makeRemove(node));
    if (!palette && node.type === 'start' && program.some(item => item.id === node.id)) {
      block.classList.add('kids-chain-anchor');
      block.title = 'Перетягни старт, щоб пересунути весь ланцюжок';
      block.addEventListener('pointerdown', beginProgramMove);
    } else attachDrag(block, node, palette);
    return block;
  }

  function makeLoop(node) {
    const wrap = document.createElement('div');
    wrap.className = 'kids-jr-loop kids-sequence-block' + (activeLoopId === node.id ? ' active-loop' : '');
    wrap.dataset.kidsId = node.id;
    wrap.title = 'Натисни, щоб додавати блоки в цикл або вийти з нього';
    wrap.addEventListener('click', event => {
      event.stopPropagation();
      activeLoopId = activeLoopId === node.id ? findLocation(node.id)?.parentId || null : node.id;
      renderSequence();
    });
    const tab = document.createElement('div');
    tab.className = 'kids-jr-loop-tab shape-purple';
    const body = document.createElement('div');
    body.className = 'kids-jr-loop-body';
    const nest = document.createElement('div');
    nest.className = 'kids-jr-loop-nest';
    attachDrop(nest, node.id);
    if (!node.children?.length) {
      const empty = document.createElement('div');
      empty.className = 'kids-jr-loop-empty';
      empty.textContent = activeLoopId === node.id ? '+' : '';
      nest.appendChild(empty);
    } else node.children.forEach((child, index) => {
      const block = makeProgramBlock(child);
      block.style.setProperty('--chain-layer', String(node.children.length - index + 1));
      nest.appendChild(block);
    });
    const cap = document.createElement('div');
    cap.className = 'kids-jr-block kids-jr-loop-cap shape-cap';
    cap.appendChild(makeIcon('repeat'));
    const chip = makeChip(node);
    if (chip) cap.appendChild(chip);
    body.append(nest, cap);
    wrap.append(tab, body, makeRemove(node));
    attachDrag(wrap, node, false);
    return wrap;
  }

  function makeProgramBlock(node) {
    return node.type === 'repeat' ? makeLoop(node) : makeSimple(node, false);
  }

  function renderPalette() {
    const tabs = byId('kidsCategoryTabs');
    const palette = byId('kidsPalette');
    if (!tabs || !palette) return;
    tabs.replaceChildren();
    palette.replaceChildren();
    categories.forEach(category => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'kids-category-tab' + (activeCategory === category.id ? ' active' : '');
      tab.style.background = category.color;
      tab.textContent = category.icon;
      tab.title = category.label;
      tab.setAttribute('aria-label', category.label);
      tab.addEventListener('click', () => { activeCategory = category.id; renderPalette(); });
      tabs.appendChild(tab);
    });
    const category = categories.find(item => item.id === activeCategory);
    category.blocks.forEach(type => palette.appendChild(makeSimple({type}, true)));
  }

  function renderSequence() {
    const sequence = byId('kidsSequence');
    if (!sequence) return;
    sequence.replaceChildren();
    if (!program.length) {
      const empty = document.createElement('div');
      empty.className = 'kids-sequence-empty';
      empty.textContent = 'Перетягни блок знизу на полотно';
      sequence.appendChild(empty);
    } else program.forEach((node, index) => {
      const block = makeProgramBlock(node);
      block.style.setProperty('--chain-layer', String(program.length - index + 1));
      sequence.appendChild(block);
    });
    renderFloating();
    if (kidsMode) applyKidsZoom();
    const hint = byId('kidsActiveLoopHint');
    if (hint) hint.hidden = !activeLoopId;
  }

  function listForLoop(id) {
    const location = id && findLocation(id);
    return location && Array.isArray(location.node.children) ? location.node.children : program;
  }

  function addBlock(type, index) {
    const def = defs[type];
    if (!def) return;
    if (type === 'start' && program.some(node => node.type === 'start')) return;
    if (type === 'end' && program.some(node => node.type === 'end')) return;
    const node = newNode(type);
    const list = type === 'start' || type === 'end' ? program : listForLoop(activeLoopId);
    if (type === 'start') list.unshift(node);
    else if (type === 'end') list.push(node);
    else if (Number.isInteger(index)) list.splice(index, 0, node);
    else list.push(node);
    if (def.container) activeLoopId = node.id;
    save();
    renderSequence();
  }

  function constrainedIndex(list, index, type) {
    if (list !== program) return Math.max(0, Math.min(list.length, index));
    if (type !== 'start' && list[0]?.type === 'start') index = Math.max(1, index);
    if (type !== 'end' && list[list.length - 1]?.type === 'end') index = Math.min(list.length - 1, index);
    return Math.max(0, Math.min(list.length, index));
  }

  function insertPaletteBlock(type, container, loopId, target, clientX, snapIndex) {
    if (!defs[type]) return;
    if (type === 'start' || type === 'end') { addBlock(type); return; }
    const list = listForLoop(loopId);
    let index = Number.isInteger(snapIndex) ? snapIndex : list.length;
    if (!Number.isInteger(snapIndex)) {
      const targetBlock = target?.closest('.kids-sequence-block');
      if (targetBlock && targetBlock.parentElement === container) {
        index = list.findIndex(node => node.id === targetBlock.dataset.kidsId);
        if (index < 0) index = list.length;
        else if (clientX > targetBlock.getBoundingClientRect().left + targetBlock.getBoundingClientRect().width / 2) index++;
      }
    }
    const node = newNode(type);
    list.splice(constrainedIndex(list, index, type), 0, node);
    if (defs[type].container) activeLoopId = node.id;
    save();
    renderSequence();
  }

  function moveNodeIntoList(id, container, loopId, target, clientX, snapIndex) {
    const list = listForLoop(loopId);
    let index = Number.isInteger(snapIndex) ? snapIndex : list.length;
    if (!Number.isInteger(snapIndex)) {
      const targetBlock = target?.closest('.kids-sequence-block');
      if (targetBlock && targetBlock.parentElement === container) {
        index = list.findIndex(node => node.id === targetBlock.dataset.kidsId);
        if (index < 0) index = list.length;
        else if (clientX > targetBlock.getBoundingClientRect().left + targetBlock.getBoundingClientRect().width / 2) index++;
      }
    }
    const location = findLocation(id);
    if (!location || (loopId && containsId(location.node, loopId))) return;
    const moved = location.list.splice(location.index, 1)[0];
    if (!Number.isInteger(snapIndex) && location.list === list && location.index < index) index--;
    list.splice(constrainedIndex(list, index, moved.type), 0, moved);
    save();
    renderSequence();
  }

  function findSnapTarget(payload, event) {
    const sequence = byId('kidsSequence');
    if (!sequence) return null;
    const scale = payload.kind === 'palette' ? kidsZoom : 1;
    const width = Number(payload.width) > 0 ? payload.width * scale : 76 * kidsZoom;
    const height = Number(payload.height) > 0 ? payload.height * scale : 66 * kidsZoom;
    const left = event.clientX - width * (Number.isFinite(payload.grabX) ? payload.grabX : .5);
    const top = event.clientY - height * (Number.isFinite(payload.grabY) ? payload.grabY : .5);
    const right = left + width;
    const bottom = top + height;
    const containers = [...sequence.querySelectorAll('.kids-jr-loop-nest'), sequence];
    for (const container of containers) {
      const blocks = [...container.children].filter(child => child.classList.contains('kids-sequence-block') && child.dataset.kidsId !== payload.id);
      const rects = blocks.map(block => block.getBoundingClientRect());
      const area = rects.length ? {
        left:Math.min(...rects.map(rect => rect.left)),
        right:Math.max(...rects.map(rect => rect.right)),
        top:Math.min(...rects.map(rect => rect.top)),
        bottom:Math.max(...rects.map(rect => rect.bottom))
      } : container.getBoundingClientRect();
      const tolerance = 22 * kidsZoom;
      if (right < area.left - tolerance || left > area.right + tolerance ||
          bottom < area.top - tolerance || top > area.bottom + tolerance) continue;
      const index = blocks.findIndex((block, i) => left + 11 * kidsZoom < rects[i].left + rects[i].width / 2);
      return {
        container,
        loopId:container === sequence ? null : container.closest('.kids-jr-loop')?.dataset.kidsId || null,
        index:index < 0 ? blocks.length : index
      };
    }
    return null;
  }

  function dropNearChainOrCanvas(payload, event) {
    const snap = findSnapTarget(payload, event);
    if (snap) {
      if (payload.kind === 'palette' && defs[payload.type]) {
        insertPaletteBlock(payload.type, snap.container, snap.loopId, null, event.clientX, snap.index);
        return;
      }
      if (payload.kind === 'sequence') {
        moveNodeIntoList(payload.id, snap.container, snap.loopId, null, event.clientX, snap.index);
        return;
      }
    }
    placeBlockOnCanvas(payload, event);
  }

  function attachDrop(container, loopId) {
    container.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move'; });
    container.addEventListener('drop', event => {
      event.preventDefault();
      event.stopPropagation();
      let payload;
      try { payload = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (_) { return; }
      completedDrag = true;
      if (payload.kind === 'palette' && defs[payload.type]) {
        insertPaletteBlock(payload.type, container, loopId, event.target, event.clientX);
      } else if (payload.kind === 'sequence') {
        moveNodeIntoList(payload.id, container, loopId, event.target, event.clientX);
      }
    });
  }

  function getDropPosition(event, width = 76) {
    const builder = byId('view-builder');
    const dock = byId('kidsPaletteDock');
    const bounds = builder.getBoundingClientRect();
    const dockTop = dock?.getBoundingClientRect().top ?? bounds.bottom;
    const left = (8 - viewPan.x) / kidsZoom;
    const right = (bounds.width - 8 - viewPan.x) / kidsZoom - width;
    const top = (70 - viewPan.y) / kidsZoom;
    const bottom = (dockTop - bounds.top - 10 - viewPan.y) / kidsZoom - 66;
    return {
      x:Math.round(Math.max(left, Math.min(Math.max(left, right), (event.clientX - bounds.left - viewPan.x) / kidsZoom - width / 2))),
      y:Math.round(Math.max(top, Math.min(Math.max(top, bottom), (event.clientY - bounds.top - viewPan.y) / kidsZoom - 33)))
    };
  }

  function placeBlockOnCanvas(payload, event) {
    const point = getDropPosition(event);
    if (payload.kind === 'palette' && defs[payload.type]) {
      floatingBlocks.push({...newNode(payload.type), ...point});
    } else if (payload.kind === 'sequence') {
      const location = findLocation(payload.id);
      if (!location) return;
      const node = location.list.splice(location.index, 1)[0];
      if (activeLoopId && containsId(node, activeLoopId)) activeLoopId = location.parentId;
      node.x = point.x;
      node.y = point.y;
      floatingBlocks.push(node);
    } else return;
    save();
    renderSequence();
  }

  function renderFloating() {
    const layer = byId('kidsWorkspaceLayer');
    if (!layer) return;
    layer.querySelectorAll(':scope > .kids-floating-block').forEach(element => element.remove());
    if (!kidsMode) return;
    floatingBlocks.forEach(node => {
      const wrapper = document.createElement('div');
      wrapper.className = 'kids-floating-block';
      wrapper.style.left = node.x + 'px';
      wrapper.style.top = node.y + 'px';
      wrapper.dataset.kidsId = node.id;
      wrapper.title = 'Під’єднай до ланцюжка, щоб блок виконувався';
      wrapper.appendChild(makeProgramBlock(node));
      layer.appendChild(wrapper);
    });
  }

  function applyProgramPosition() {
    const sequence = byId('kidsSequence');
    if (!sequence) return;
    sequence.style.left = programPosition.x + 'px';
    sequence.style.top = programPosition.y + 'px';
  }

  function applyKidsZoom() {
    applyProgramPosition();
    const layer = byId('kidsWorkspaceLayer');
    const grid = byId('kidsGridLayer');
    if (layer) layer.style.transform = `translate(${viewPan.x}px, ${viewPan.y}px) scale(${kidsZoom})`;
    if (grid) {
      const spacing = 30 * kidsZoom;
      grid.style.backgroundSize = `${spacing}px ${spacing}px`;
      grid.style.backgroundPosition = `${viewPan.x}px ${viewPan.y}px`;
    }
  }

  function beginProgramMove(event) {
    if (!kidsMode || event.button !== 0 || event.target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const initial = {...programPosition};
    function move(next) {
      programPosition = {x:initial.x + (next.clientX - startX) / kidsZoom, y:initial.y + (next.clientY - startY) / kidsZoom};
      applyProgramPosition();
    }
    function finish() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      save();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function attachCanvasDrop(builder) {
    builder.addEventListener('wheel', event => {
      if (!kidsMode || event.target.closest('#kidsPaletteDock, .sensor-row, input')) return;
      event.preventDefault();
      event.stopPropagation();
      const delta = Math.max(-120, Math.min(120, event.deltaY * (event.deltaMode === 1 ? 16 : 1)));
      const next = Math.max(.55, Math.min(1.5, kidsZoom * Math.exp(-delta * .00045)));
      if (Math.abs(next - kidsZoom) < .001) return;
      const bounds = builder.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      const worldX = (cursorX - viewPan.x) / kidsZoom;
      const worldY = (cursorY - viewPan.y) / kidsZoom;
      kidsZoom = Math.round(next * 1000) / 1000;
      viewPan = {x:cursorX - worldX * kidsZoom, y:cursorY - worldY * kidsZoom};
      applyKidsZoom();
      clearTimeout(zoomCommitTimer);
      zoomCommitTimer = setTimeout(() => { zoomCommitTimer = null; save(); }, 180);
    }, {capture:true, passive:false});
    builder.addEventListener('dragover', event => {
      if (!kidsMode || event.target.closest('#kidsPaletteDock')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    builder.addEventListener('drop', event => {
      if (!kidsMode || event.target.closest('#kidsPaletteDock, #kidsSequence')) return;
      event.preventDefault();
      let payload;
      try { payload = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (_) { return; }
      completedDrag = true;
      dropNearChainOrCanvas(payload, event);
    });
  }

  function xmlNumber(name, value) {
    const wrapper = document.createElement('value');
    wrapper.setAttribute('name', name);
    const shadow = document.createElement('shadow');
    shadow.setAttribute('type', 'math_number');
    const field = document.createElement('field');
    field.setAttribute('name', 'NUM');
    field.textContent = String(value);
    shadow.appendChild(field);
    wrapper.appendChild(shadow);
    return wrapper;
  }

  function xmlField(name, value) {
    const field = document.createElement('field');
    field.setAttribute('name', name);
    field.textContent = String(value);
    return field;
  }

  function xmlBlock(type) {
    const block = document.createElement('block');
    block.setAttribute('type', type);
    return block;
  }

  function xmlForNode(node) {
    const value = node.param ?? defs[node.type]?.param;
    let block;
    switch (node.type) {
      case 'forward': case 'back': case 'drive_time':
        block = xmlBlock('robot_move_soft');
        block.append(xmlNumber('TARGET', node.type === 'back' ? -60 : 60), xmlNumber('SEC', Number(value) || 1));
        break;
      case 'left': case 'right': case 'uturn':
        block = xmlBlock('robot_turn_timed');
        block.append(xmlField('DIR', node.type === 'right' ? 'RIGHT' : 'LEFT'), xmlNumber('SEC', node.type === 'uturn' ? 1 : Math.max(.1, Number(value) / 180)));
        break;
      case 'slow': case 'fast':
        block = xmlBlock('robot_set_speed'); block.append(xmlNumber('SPEED', node.type === 'slow' ? 30 : 80)); break;
      case 'motor_stop': case 'end': block = xmlBlock('robot_stop'); break;
      case 'sensor_wait':
        block = xmlBlock('wait_until_sensor');
        block.append(xmlField('SENS', 1), xmlField('OP', 'GT'), xmlNumber('VAL', Number(value) || 50));
        break;
      case 'wait': block = xmlBlock('wait_seconds'); block.append(xmlNumber('SECONDS', Number(value) || 1)); break;
      case 'smile': block = xmlBlock('disp_smile'); block.append(xmlField('FACE', 'happy')); break;
      case 'say':
        block = xmlBlock('disp_text');
        block.append(xmlField('TXT', String(value || 'HI')), xmlField('SIZE', 'small'), xmlNumber('X', 0), xmlNumber('Y', 0));
        break;
      case 'clear': block = xmlBlock('disp_clear'); break;
      case 'repeat':
        block = xmlBlock('controls_repeat_ext');
        block.append(xmlNumber('TIMES', Number(value) || 3));
        if (node.children?.length) {
          const statement = document.createElement('statement');
          statement.setAttribute('name', 'DO');
          statement.appendChild(xmlChain(node.children));
          block.appendChild(statement);
        }
        break;
      default: return [];
    }
    return node.type === 'smile' || node.type === 'say' || node.type === 'clear' ? [block, xmlBlock('disp_send')] : [block];
  }

  function xmlChain(nodes) {
    let first = null;
    let previous = null;
    nodes.forEach(node => {
      if (node.type === 'start') return;
      xmlForNode(node).forEach(block => {
        if (!first) first = block;
        if (previous) {
          const next = document.createElement('next');
          next.appendChild(block);
          previous.appendChild(next);
        }
        previous = block;
      });
    });
    return first;
  }

  function restoreNormalWorkspace() {
    if (!normalWorkspaceBackup) return;
    const backup = normalWorkspaceBackup;
    normalWorkspaceBackup = null;
    Promise.resolve(typeof window.stopCode === 'function' ? window.stopCode() : null).catch(() => {}).then(() => {
      const workspace = getWorkspace();
      if (!workspace || !window.Blockly?.Xml) return;
      workspace.clear();
      Blockly.Xml.domToWorkspace(backup, workspace);
    });
  }

  window.kidsRunProgram = function () {
    const workspace = getWorkspace();
    if (!workspace || !window.Blockly?.Xml) { alert('Редактор ще завантажується.'); return; }
    const xml = document.createElement('xml');
    const start = xmlBlock('start_hat');
    xml.appendChild(start);
    const first = xmlChain(program);
    if (first) { const next = document.createElement('next'); next.appendChild(first); start.appendChild(next); }
    try {
      if (!normalWorkspaceBackup) normalWorkspaceBackup = Blockly.Xml.workspaceToDom(workspace);
      workspace.clear();
      Blockly.Xml.domToWorkspace(xml, workspace);
      if (typeof window.toggleRunState === 'function') window.toggleRunState();
      else if (typeof window.runCode === 'function') window.runCode();
    } catch (error) { console.warn('[ROB0] Не вдалося запустити дитячу програму', error); }
  };

  window.kidsClearProgram = function () { program = []; floatingBlocks = []; activeLoopId = null; save(); renderSequence(); };
  window.kidsExitLoop = function () {
    activeLoopId = activeLoopId ? findLocation(activeLoopId)?.parentId || null : null;
    renderSequence();
  };

  function showView(viewId, button) {
    try { if (typeof window.switchView === 'function') window.switchView(viewId, button); } catch (_) {}
    document.querySelectorAll('section[id^="view-"]').forEach(section => {
      const active = section.id === viewId;
      section.classList.toggle('hidden', !active);
      section.classList.toggle('opacity-0', !active);
    });
    document.querySelectorAll('#rcTopNav .nav-btn').forEach(nav => nav.classList.toggle('active', nav === button));
  }

  function updateButton() {
    const button = byId('kidsModeNavBtn');
    if (!button) return;
    button.classList.toggle('kids-active', kidsMode);
    button.setAttribute('aria-pressed', String(kidsMode));
    button.title = kidsMode ? 'Дитячі блоки увімкнено' : 'Для дітей';
  }

  function restoreDock() {
    const dock = byId('kidsPaletteDock');
    const sequence = byId('kidsSequence');
    const home = byId('view-kids');
    const stage = byId('kidsStage');
    const builder = byId('view-builder');
    if (zoomCommitTimer) { clearTimeout(zoomCommitTimer); zoomCommitTimer = null; save(); }
    if (dock && home && dock.parentElement !== home) home.appendChild(dock);
    if (sequence && stage && sequence.parentElement !== stage) stage.appendChild(sequence);
    if (sequence) sequence.style.transform = '';
    builder?.classList.remove('kids-canvas-mode');
    byId('kidsWorkspaceLayer')?.remove();
    byId('kidsGridLayer')?.remove();
  }

  window.rbSetKidsMode = function (enabled) {
    kidsMode = Boolean(enabled);
    updateButton();
    const workspace = getWorkspace();
    const toolbox = byId(kidsMode ? 'kidsToolbox' : 'toolbox');
    try { if (workspace && toolbox) workspace.updateToolbox(toolbox); } catch (_) {}
    return Boolean(workspace);
  };

  window.openKidsMode = function (button) {
    kidsMode = true;
    updateButton();
    const builder = byId('view-builder');
    if (builder) {
      let grid = byId('kidsGridLayer');
      if (!grid) {
        grid = document.createElement('div');
        grid.id = 'kidsGridLayer';
        grid.setAttribute('aria-hidden', 'true');
      }
      let layer = byId('kidsWorkspaceLayer');
      if (!layer) {
        layer = document.createElement('div');
        layer.id = 'kidsWorkspaceLayer';
      }
      layer.appendChild(byId('kidsSequence'));
      builder.append(grid, layer, byId('kidsPaletteDock'));
      builder.classList.add('kids-canvas-mode');
      grid.style.backgroundColor = getComputedStyle(byId('blocklyDiv')).backgroundColor;
    }
    showView('view-builder', button);
    renderPalette();
    renderSequence();
  };

  window.closeKidsMode = function () {
    restoreDock();
    window.rbSetKidsMode(false);
    restoreNormalWorkspace();
    showView('view-joystick', document.querySelector('#rcTopNav button[title="Пульт"]'));
  };

  window.openBlockMode = function (button) {
    restoreDock();
    window.rbSetKidsMode(false);
    restoreNormalWorkspace();
    showView('view-builder', button);
  };

  window.addEventListener('load', () => {
    const sequence = byId('kidsSequence');
    if (sequence) attachDrop(sequence, null);
    const builder = byId('view-builder');
    if (builder) attachCanvasDrop(builder);
    const runButton = byId('globalRunBtn');
    if (runButton) runButton.addEventListener('click', event => {
      if (!kidsMode) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.kidsRunProgram();
    }, true);
    renderPalette();
    renderSequence();
    updateHistoryButtons();
    updateButton();
  });
})();
