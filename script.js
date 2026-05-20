let workspace;
let isRunning = false;
const jsGen = javascript.javascriptGenerator;
let actionBuffer = [];
let isSending = false;
let isToolboxVisible = true;
let currentInputs = new Array(10).fill(0);
let runningEvents = new Set();
let characteristic = null;
let bluetoothDevice = null;
let isManualDisconnect = false;
let currentController = new AbortController();
const originalShowPositionedByField = Blockly.DropDownDiv.showPositionedByField;

const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHAR_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

const encodeIO = (index, state) => (index << 1) | (state ? 1 : 0);
const decodeIO = (byte) => ({index: byte >> 1, state: byte & 0x01});

let isLastInputTouch = false;

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('Service Worker zarejestrowany'))
        .catch(err => console.log('Błąd SW:', err));
}

window.addEventListener('touchstart', () => {
  isLastInputTouch = true;
  document.body.classList.add('touch-user');
  document.body.classList.remove('mouse-user');
}, { passive: true });

window.addEventListener('mousemove', function onMouseMove() {
  isLastInputTouch = false;
  document.body.classList.add('mouse-user');
  document.body.classList.remove('touch-user');
});

Blockly.Blocks['event_input_0_change'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("kiedy")
        .appendField(new Blockly.FieldDropdown([
          ["wciśnięto", "HIGH"], 
          ["puszczono", "LOW"]
        ]), "STATE")
        .appendField("przycisk dla pieszych");
        
    this.setNextStatement(true, null);
    this.hat = 'cap';
    this.setTooltip("Zarejestrowanie zmiany stanu przycisku dla pieszych");
  }
};

Blockly.Blocks['event_input_1_change'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("kiedy")
        .appendField(new Blockly.FieldDropdown([
          ["wciśnięto", "HIGH"], 
          ["puszczono", "LOW"]
        ]), "STATE")
        .appendField("przycisk pomocniczy");
        
    this.setNextStatement(true, null);
    this.hat = 'cap';
    this.setTooltip("Zarejestrowanie zmiany stanu przycisku BOOT");
  }
};

Blockly.Blocks['event_start'] = {
  init: function() {
	this.appendDummyInput().appendField("kiedy uruchomiono");
	this.setNextStatement(true, null);
	this.hat = 'cap';
	this.setTooltip("Blok startowy (wykonywany po uruchomieniu programu)");
  }
};

Blockly.Blocks['control_forever'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("zawsze");
    this.appendStatementInput("STACK");
    this.setPreviousStatement(true, null);
    this.setNextStatement(false);
	this.setTooltip("Wykonuj w nieskończonej pętli");
  }
};

Blockly.Blocks['control_wait_until'] = {
  init: function() {
    this.appendValueInput("CONDITION")
        .setCheck("Boolean")
        .appendField("czekaj aż");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
	this.setTooltip("Jeśli warunek zostanie spełniony, program przejdzie dalej");
  }
};

Blockly.Blocks['sensor_input_0'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("przycisk dla pieszych wciśnięty");
    this.setOutput(true, "Boolean");
	this.setTooltip("Zwraca prawdę, jeśli przycisk dla pieszych jest wciśnięty");
  }
};

Blockly.Blocks['sensor_input_1'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("przycisk pomocniczy wciśnięty");
    this.setOutput(true, "Boolean");
	this.setTooltip("Zwraca prawdę, jeśli przycisk BOOT jest wciśnięty");
  }
};

Blockly.Blocks['action_led_traffic'] = {
  init: function() {
	this.appendDummyInput()
		.appendField("samochody:")
		.appendField(new Blockly.FieldDropdown([
			["zapal", "1"],["zgaś", "0"]
		]), "STATE")
		.appendField(new Blockly.FieldDropdown([
			["czerwone 🔴", "0"],["żółte 🟡", "1"],["zielone 🟢", "2"]
		]), "COLOR")
		.appendField("światło");
	this.setPreviousStatement(true, null);
	this.setNextStatement(true, null);
	this.setTooltip("Sterowanie sygnalizatorem dla samochodów");
  }
};

Blockly.Blocks['action_led_pedestrian'] = {
  init: function() {
	this.appendDummyInput()
		.appendField("piesi:")
		.appendField(new Blockly.FieldDropdown([
			["zapal", "1"],["zgaś", "0"]
		]), "STATE")
		.appendField(new Blockly.FieldDropdown([
			["czerwone 🔴", "3"],["zielone 🟢", "4"]
		]), "COLOR")
		.appendField("światło");
	this.setPreviousStatement(true, null);
	this.setNextStatement(true, null);
	this.setTooltip("Sterowanie sygnalizatorem dla pieszych");
  }
};

Blockly.Blocks['action_led_builtin'] = {
  init: function() {
	this.appendDummyInput()
        .appendField("wbudowana dioda: 🔴")
        .appendField(new Blockly.FieldDropdown([["wył", "LOW"], ["wł", "HIGH"]]), "R")
        .appendField("🟢")
        .appendField(new Blockly.FieldDropdown([["wył", "LOW"], ["wł", "HIGH"]]), "G")
        .appendField("🔵")
        .appendField(new Blockly.FieldDropdown([["wył", "LOW"], ["wł", "HIGH"]]), "B");
	this.setPreviousStatement(true, null);
	this.setNextStatement(true, null);
	this.setTooltip("Sterowanie wbudowaną diodą świecącą");
  }
};

Blockly.Blocks['action_led_turn_off_all'] = {
  init: function() {
	this.appendDummyInput().appendField("zgaś wszystkie światła");
	this.setPreviousStatement(true, null);
	this.setNextStatement(true, null);
	this.setTooltip("Wyłączanie wszystkich świateł (w tym wbudowanej diody RGB)");
  }
};

Blockly.Blocks['action_wait'] = {
  init: function() {
	this.appendDummyInput()
		.appendField("czekaj")
		.appendField(new Blockly.FieldNumber(1, 0), "SECONDS")
		.appendField("sekund");
	this.setPreviousStatement(true, null);
	this.setNextStatement(true, null);
  }
};

jsGen.STATEMENT_PREFIX = 'highlightBlock(%1);\nawait sleep(0);\n';
jsGen.addReservedWords('highlightBlock');

jsGen.forBlock['event_start'] = () => '';
jsGen.forBlock['event_input_0_high'] = () => '';
jsGen.forBlock['event_input_0_low'] = () => '';
jsGen.forBlock['event_input_1_high'] = () => '';
jsGen.forBlock['event_input_1_low'] = () => '';

jsGen.forBlock['control_forever'] = (block) => {
  const branch = jsGen.statementToCode(block, 'STACK');
  return `while (true) {\n${branch}}\n`;
};

jsGen.forBlock['control_wait_until'] = (block) => {
  const condition = jsGen.valueToCode(block, 'CONDITION', jsGen.ORDER_NONE) || 'false';
  return `while (!(${condition})) {\n  await flushActions();\nawait sleep(10);\n}\n`;
};

jsGen.forBlock['sensor_input_0'] = (block) => {
  const code = `currentInputs[0]`;
  return [code, jsGen.ORDER_ATOMIC];
};

jsGen.forBlock['sensor_input_1'] = (block) => {
  const code = `currentInputs[1]`;
  return [code, jsGen.ORDER_ATOMIC];
};

jsGen.forBlock['action_led_traffic'] = (block) => {
  const color = block.getFieldValue('COLOR');
  const state = block.getFieldValue('STATE');
  const byte = encodeIO(Number(color), Number(state));
  return `queueAction(${byte});\n`;
};

jsGen.forBlock['action_led_pedestrian'] = (block) => {
  const color = block.getFieldValue('COLOR');
  const state = block.getFieldValue('STATE');
  const byte = encodeIO(Number(color), Number(state));
  return `queueAction(${byte});\n`;
};

jsGen.forBlock['action_led_builtin'] = (block) => {
  const r = block.getFieldValue('R');
  const g = block.getFieldValue('G');
  const b = block.getFieldValue('B');
  const byteR = encodeIO(7, Number(r));
  const byteG = encodeIO(8, Number(g));
  const byteB = encodeIO(9, Number(b));
  return `queueAction(${byteR});\nqueueAction(${byteG});\nqueueAction(${byteB});\n`;
};

jsGen.forBlock['action_led_turn_off_all'] = (block) => {
  const byte = encodeIO(10, 0);
  return `queueAction(${byte});\n`;
};

jsGen.forBlock['action_wait'] = (block) => {
  const ms = block.getFieldValue('SECONDS') * 1000;
  return `await flushActions();\nawait sleep(${ms});\n`;
};

window.addEventListener('DOMContentLoaded', checkRealOrientation);
window.addEventListener('orientationchange', () => {
  setTimeout(checkRealOrientation, 200);
});

if (originalShowPositionedByField) {
  Blockly.DropDownDiv.showPositionedByField = function(field, opt_onHide) {
    originalShowPositionedByField.call(this, field, opt_onHide);

    if (window.innerHeight <= 450 && window.innerWidth > window.innerHeight) {
	  const offset = 30;
      const div = document.querySelector('.blocklyDropDownDiv');
      if (!div) return;
      const fieldSvg = field.getSvgRoot();
      if (!fieldSvg) return;
      const fieldRect = fieldSvg.getBoundingClientRect();
      const divRect = div.getBoundingClientRect();
      let left = fieldRect.right + offset; 
      if (left + divRect.width > window.innerWidth) {
        left = fieldRect.left - divRect.width - offset;
      }
      let top = fieldRect.top + (fieldRect.height / 2) - (divRect.height / 2);
      if (top < 5) top = 5;
      if (top + divRect.height > window.innerHeight - 5) {
        top = window.innerHeight - divRect.height - 5;
      }
      div.style.left = left + 'px';
      div.style.top = top + 'px';
      const arrow = document.querySelector('.blocklyDropDownArrow');
      if (arrow) arrow.style.opacity = '0';
    }
  };
}

function showToast(type, title, message) {
    const wrapper = document.getElementById('toast-wrapper');
    
    const icons = {
        success: '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
        error:   '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
        info:    '<svg viewBox="0 0 24 24"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>',
        warning: '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast-card toast-${type}`;
    
    toast.innerHTML = `
        <div class="toast-side-bar"></div>
        <div class="toast-content">
            <div class="toast-icon">${icons[type]}</div>
            <div class="toast-text">
                <div class="toast-title">${title}</div>
                <div class="toast-msg">${message}</div>
            </div>
            <div class="toast-close" onclick="this.parentElement.parentElement.remove()">×</div>
        </div>
    `;

    wrapper.appendChild(toast);
	
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function saveWorkspace() {
    try {
        const xml = Blockly.Xml.workspaceToDom(workspace);
        const xmlText = Blockly.Xml.domToText(xml);
        localStorage.setItem('espBlockly_save_xml', xmlText);
    } catch (e) {
        console.error("Błąd zapisu XML:", e);
    }
}

function loadWorkspace() {
    const xmlText = localStorage.getItem('espBlockly_save_xml');
    if (xmlText) {
        try {
            const xml = Blockly.utils.xml.textToDom(xmlText);
            Blockly.Xml.domToWorkspace(xml, workspace);
        } catch (e) {
            console.error("Błąd wczytywania XML:", e);
        }
    }
}

function queueAction(byte) {
  actionBuffer.push(byte);
  if (actionBuffer.length >= 10) flushActions();
}

async function flushActions() {
  if (actionBuffer.length === 0 || isSending) return;
  isSending = true;
  
  const packetToSend = [...actionBuffer];
  actionBuffer = [];

  try {
    await send(packetToSend);
  } catch (err) {
    showToast('error', 'Błąd', 'Nie udało się wysłać poleceń przez Bluetooth');
  } finally {
    isSending = false;
    
    if (actionBuffer.length > 0) setTimeout(flushActions, 10);
  }
}

async function send(bytes) {
  if (!characteristic) {
    showToast('error', 'Błąd', 'Brak połączenia z urządzeniem');
    return;
  }
  try {
    const data = new Uint8Array(bytes);
    await characteristic.writeValueWithoutResponse(data);
  } catch (err) {
    showToast('error', 'Błąd', 'Nie udało się wysłać poleceń przez Bluetooth');
  }
}

function autoColorBlocksFromXml(xmlInput) {
  let toolboxDoc;
  let isString = false;

  if (typeof xmlInput === 'string') {
    const parser = new DOMParser();
    toolboxDoc = parser.parseFromString(xmlInput, 'text/xml');
    isString = true;
  } else {
    toolboxDoc = xmlInput; 
  }

  if (!toolboxDoc) return xmlInput;

  function overrideBlockColor(blockType, color) {
    if (Blockly.Blocks[blockType] && !Blockly.Blocks[blockType].isColorOverridden) {
      const originalInit = Blockly.Blocks[blockType].init;

      Blockly.Blocks[blockType].init = function() {
        this.setStyle = function(styleName) {};
        this.styleName_ = null;

        if (typeof originalInit === 'function') {
          originalInit.call(this);
        }
        
        this.styleName_ = null;
        this.setColour(color);
      };
      Blockly.Blocks[blockType].isColorOverridden = true;
    }
  }

  const categories = toolboxDoc.getElementsByTagName('category');

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const catColor = category.getAttribute('colour');
    const customType = category.getAttribute('custom');
    
    if (!catColor) continue;

    if (customType === 'VARIABLE') {
      const variableBlockTypes = ['variables_get', 'variables_set', 'math_change'];
      variableBlockTypes.forEach(blockType => {
        overrideBlockColor(blockType, catColor);
      });
    }

    const blockNodes = category.querySelectorAll('block, shadow');
    for (let j = 0; j < blockNodes.length; j++) {
      const node = blockNodes[j];
      const blockType = node.getAttribute('type');
      const chosenColor = node.getAttribute('colour') || catColor;
      overrideBlockColor(blockType, chosenColor);
	  if (blockType === 'controls_if') {
	    const subIfBlocks = ['controls_if_if', 'controls_if_elseif', 'controls_if_else'];
	    subIfBlocks.forEach(subType => {
		  overrideBlockColor(subType, chosenColor);
	    });
	  }
    }
  }

  if (isString) {
    return toolboxDoc.documentElement;
  }
  return xmlInput;
}

function checkRealOrientation() {
  let isLandscape = false;

  if (screen.orientation && screen.orientation.type) {
    isLandscape = screen.orientation.type.includes('landscape');
  } else {
    isLandscape = Math.abs(window.orientation) === 90;
  }

  if (isLandscape) {
    document.body.classList.add('real-landscape');
  } else {
    document.body.classList.remove('real-landscape');
  }
}

async function initApp() {
  try {
    const response = await fetch('toolbox.xml');
    const toolboxText = await response.text();
	const originalFieldNumberShowEditor = Blockly.FieldNumber.prototype.showEditor_;
	
	Blockly.dialog.setPrompt((message, defaultValue, callback) => {
	  const overlay = document.createElement('div');
	  overlay.className = 'custom-modal-overlay';
	  const modal = document.createElement('div');
	  modal.className = 'custom-modal';
	  const title = document.createElement('div');
	  title.className = 'custom-modal-title';
	  title.innerText = message;
	  const input = document.createElement('input');
	  input.type = 'text';
	  input.className = 'custom-modal-input';
	  input.value = defaultValue || '';
	  const actions = document.createElement('div');
	  actions.className = 'custom-modal-actions';
	  const cancelBtn = document.createElement('button');
	  cancelBtn.className = 'custom-modal-btn btn-cancel';
	  cancelBtn.innerText = 'Anuluj';
	  const confirmBtn = document.createElement('button');
	  confirmBtn.className = 'custom-modal-btn btn-confirm';
	  confirmBtn.innerText = 'OK';
	  const updateViewport = () => {
		if (window.visualViewport) {
		  overlay.style.top = window.visualViewport.offsetTop + 'px';
		  overlay.style.left = window.visualViewport.offsetLeft + 'px';
		  overlay.style.height = window.visualViewport.height + 'px';
		  overlay.style.width = window.visualViewport.width + 'px';
		}
	  };
	  if (window.visualViewport) {
		window.visualViewport.addEventListener('resize', updateViewport);
		window.visualViewport.addEventListener('scroll', updateViewport);
	  }
	  const closeModal = (result) => {
		if (window.visualViewport) {
		  window.visualViewport.removeEventListener('resize', updateViewport);
		  window.visualViewport.removeEventListener('scroll', updateViewport);
		}
		document.body.removeChild(overlay);
		callback(result);
	  };
	  cancelBtn.addEventListener('click', () => closeModal(null));
	  confirmBtn.addEventListener('click', () => {
		const val = input.value.trim();
		closeModal(val ? val : null);
	  });
	  input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') confirmBtn.click();
		if (e.key === 'Escape') cancelBtn.click();
	  });
	  actions.appendChild(cancelBtn);
	  actions.appendChild(confirmBtn);
	  modal.appendChild(title);
	  modal.appendChild(input);
	  modal.appendChild(actions);
	  overlay.appendChild(modal);
	  document.body.appendChild(overlay);
	  updateViewport();
	  setTimeout(() => {
		input.focus();
		input.scrollIntoView({ block: 'center' });
	  }, 80);
	});
	
	Blockly.FieldNumber.prototype.showEditor_ = function(opt_e) {
	 
	  if (!isLastInputTouch) {
		originalFieldNumberShowEditor.call(this, opt_e);
		return;
	  }
	  const contentDiv = Blockly.DropDownDiv.getContentDiv();
	  contentDiv.innerHTML = '';
	  const numpad = document.createElement('div');
	  numpad.className = 'scratch-numpad';
	  
	  const initialVal = this.getValue().toString();
	  let currentVal = '';
	  
	  let isConfirmed = false;

	  const originalGetDisplayText = this.getDisplayText_;
	  const originalGetText = this.getText;
	  
	  this.getDisplayText_ = () => currentVal;
	  this.getText = () => currentVal;
	  
	  if (this.forceRerender) this.forceRerender();
	  
	  const buttons = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', '.', '⌫', 'Zatwierdź'];
	  buttons.forEach(text => {
		const btn = document.createElement('button');
		btn.innerText = text;
		btn.className = 'numpad-btn';
		if (text === '⌫') {
		  btn.classList.add('btn-delete');
		} else if (text === 'Zatwierdź') {
		  btn.classList.add('btn-confirm');
		  btn.style.gridColumn = 'span 2';
		}
		btn.addEventListener('click', (e) => {
		  e.preventDefault();
		  
		  if (text === 'Zatwierdź') {
			isConfirmed = true;
			Blockly.DropDownDiv.hideIfOwner(this);
			return;
		  }

		  if (text === '⌫') {
			currentVal = currentVal.slice(0, -1);
		  } else if (text === '-') {
			if (currentVal.startsWith('-')) {
			  currentVal = currentVal.slice(1);
			} else {
			  currentVal = '-' + currentVal;
			}
		  } else {
			if (text === '.' && currentVal.includes('.')) return;
			currentVal += text;
		  }
		  
		  if (this.forceRerender) this.forceRerender();
		});
		numpad.appendChild(btn);
	  });
	  
	  contentDiv.appendChild(numpad);
	  Blockly.DropDownDiv.setColour('#ffffff', '#dddddd');
	  
	  Blockly.DropDownDiv.showPositionedByField(this, () => {
		if (originalGetDisplayText) this.getDisplayText_ = originalGetDisplayText;
		if (originalGetText) this.getText = originalGetText;
		
		if (isConfirmed) {
		  this.setValue(currentVal || '0');
		} else {
		  this.setValue(initialVal);
		}
		if (this.forceRerender) this.forceRerender();
	  });
	};
			
    workspace = Blockly.inject('blocklyDiv', {
      toolbox: autoColorBlocksFromXml(toolboxText),
      maxInstances: { 'event_start': 1}, 
      grid: { spacing: 25, length: 3, colour: '#ccc', snap: true },
	  zoom: { controls: true, wheel: true, startScale: 1.0 },
	  trashcan: false,
	  renderer: 'zelos'
    });
	
	loadWorkspace();

    window.addEventListener('resize', () => Blockly.svgResize(workspace));
	
	workspace.addChangeListener((e) => {
	  if (e.type === Blockly.Events.BLOCK_DRAG) {	  
		const toolbox = document.querySelector('.blocklyToolbox');
		if (toolbox) {
		  if (e.isStart) {
			toolbox.classList.add('toolbox-delete-zone');
		  } else {
			toolbox.classList.remove('toolbox-delete-zone');
		  }
		}
	  }
	});
	
	workspace.addChangeListener((event) => {
	  if (event.isUiEvent) return;
	  if (isRunning){
		stopCode();
		showToast('info', 'Zatrzymanie programu', 'Zatrzymano pracę programu');
	  }
	  saveWorkspace();
	});
	
  } catch (error) {
    console.error("Błąd podczas ładowania Toolboxa:", error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    if (currentController.signal.aborted) return;
    const id = setTimeout(resolve, ms);
    currentController.signal.addEventListener('abort', () => {
      clearTimeout(id);
    });
  });
}

function handleRunStop() {
  if (isRunning){
	stopCode();
	showToast('info', 'Zatrzymanie programu', 'Zatrzymano pracę programu');
  }
  else runCode();
}

function stopCode() {
  isRunning = false;
  runningEvents.clear();
  
  currentController.abort();
  
  workspace.getAllBlocks(false).forEach(block => {
    block.setHighlighted(false);
  });
  
  const btn = document.getElementById('runStopButton');
  if (btn) {
    const img = btn.querySelector('img');
    img.src = "icons/run.png";
  }
}

async function runCode() {
  if (!workspace) return;
  
  if (!characteristic) {
	showToast('warning', 'Brak połączenia', 'Połącz się z urządzeniem');
    return;
  }
  
  let lastId = null; 
  
  actionBuffer = [];
  const blocks = workspace.getAllBlocks(false);
  const startBlock = blocks.find(b => b.type === 'event_start');
  
  if (!startBlock) { showToast('warning', 'Brak bloku startowego', 'Umieść blok <b>kiedy uruchomiono</b> w polu roboczym. Od niego program rozpoczyna pracę'); return; }

  currentController.abort();
  currentController = new AbortController();

  jsGen.init(workspace);
  let code = jsGen.blockToCode(startBlock.getNextBlock());
  
  code += '\nawait flushActions();';

  const btn = document.getElementById('runStopButton');
  isRunning = true;
  const img = btn.querySelector('img');
  img.src = "icons/stop.png";

  try {
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
    
	const doHighlightBlock = (id) => {
	  if (!isRunning) return;

	  if (lastId) {
		const lastBlock = workspace.getBlockById(lastId);
		if (lastBlock) lastBlock.setHighlighted(false);
	  }

	  lastId = id;
	  if (id) {
		const block = workspace.getBlockById(id);
		if (block) block.setHighlighted(true);
	  }
	};

    const compiledCode = new AsyncFunction('sleep', 'highlightBlock', 'queueAction', 'flushActions', code);    
    await compiledCode(sleep, doHighlightBlock, queueAction, flushActions);

  } catch (e) {
    if (e !== "STOPPED_BY_USER") console.error(e);
  } finally {
    if (isRunning) {
		stopCode();
		showToast('info', 'Koniec programu', 'Program zakończył pracę');
	}
	if (lastId) {
		const lastBlock = workspace.getBlockById(lastId);
		if (lastBlock) lastBlock.setHighlighted(false);
	  }
  }
}

function toggleMenu() {
  if (!workspace) return;
  const toolbox = workspace.getToolbox();
  if (toolbox) {
    isToolboxVisible = !isToolboxVisible;
    toolbox.setVisible(isToolboxVisible);
    Blockly.svgResize(workspace);
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(e => console.error(e));
  } else {
    document.exitFullscreen();
  }
}

function updateInputState(index, value) {
  if (index < 0 || index >= 10) return;

  const oldValue = currentInputs[index];
  currentInputs[index] = value;
  
  if (oldValue === 0 && value === 1) {
    executeEventBlock(index, 'HIGH');
  } else if (oldValue === 1 && value === 0) {
    executeEventBlock(index, 'LOW');
  }
}

async function executeEventBlock(index, triggeredState) {
  if (!workspace || !isRunning) return;
  
  const blockType = `event_input_${index}_change`;
  if (runningEvents.has(blockType)) return;
  
  const blocks = workspace.getAllBlocks(false);
  
  const eventBlock = blocks.find(b => {
    if (b.type === blockType) {
      const selectedState = b.getFieldValue('STATE');
      return selectedState === triggeredState;
    }
    return false;
  });

  if (eventBlock && eventBlock.getNextBlock()) {  
    runningEvents.add(blockType);
    
    let lastId = null; 
    jsGen.init(workspace);
    let code = jsGen.blockToCode(eventBlock.getNextBlock());
    code += '\nawait flushActions();';

    try {
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

      const doHighlightBlock = (id) => {
        if (!isRunning && !runningEvents.has(blockType)) return;

        if (lastId) {
          const lastBlock = workspace.getBlockById(lastId);
          if (lastBlock) lastBlock.setHighlighted(false);
        }

        lastId = id;
        if (id) {
          const block = workspace.getBlockById(id);
          if (block) block.setHighlighted(true);
        }
      };
      
      const compiled = new AsyncFunction('sleep', 'highlightBlock', 'queueAction', 'flushActions', code);
      await compiled(sleep, doHighlightBlock, queueAction, flushActions);
    } catch (e) {
      if (e !== "STOPPED_BY_USER") console.error(`Błąd w zdarzeniu ${blockType}:`, e);
    } finally {
      runningEvents.delete(blockType);
      if (lastId) {
        const lastBlock = workspace.getBlockById(lastId);
        if (lastBlock) lastBlock.setHighlighted(false);
      }
    }
  }
}

async function connectBLE() {
  if (bluetoothDevice && bluetoothDevice.gatt.connected) {
	isManualDisconnect = true;
    bluetoothDevice.gatt.disconnect();
    return; 
  }
  
  isManualDisconnect = false;
	
  try {
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "Sygnalizator" }],
      optionalServices: [SERVICE_UUID]
    });

    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);

    const server = await bluetoothDevice.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    characteristic = await service.getCharacteristic(CHAR_UUID);

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      const byte = event.target.value.getUint8(0);
      const data = decodeIO(byte);
      updateInputState(data.index, data.state);
    });
	
	const btn = document.getElementById('bluetoothBtn');
    if (btn) {
	  const img = btn.querySelector('img');
	  img.src = "icons/bt_connected.png";
    }
	showToast('success', 'Połączono', 'Nawiązano połączenie z urządzeniem');
	
	queueAction(0xFF);
	flushActions();
	
  } catch (err) {
		if (err.name === 'NotFoundError') return;
		showToast('error', 'Błąd połączenia', 'Nie udało się połączyć z urządzeniem. Spróbuj ponownie');
  }
}

function onDisconnected() {
  characteristic = null;
  bluetoothDevice = null;
  
  if (isManualDisconnect) showToast('info', 'Rozłączono', 'Pomyślnie rozłączono z urządzeniem');
  else showToast('warning', 'Utracono połączenie', 'Połącz się ponownie z urządzeniem');
  
  isManualDisconnect = false;
  
  const btn = document.getElementById('bluetoothBtn');
  if (btn) {
	const img = btn.querySelector('img');
	img.src = "icons/bt_disconnected.png";
  }
  
  if (isRunning) stopCode();
}

initApp();