import { getContext } from '../../../extensions.js';
import { callPopup, chat, addWorldEntry } from '../../../../script.js';

// 插件元数据
const EXTENSION_NAME = 'Long Term Memory';
const PANEL_ID = 'long-term-memory-panel';
let isPanelVisible = false;

// 插件设置和状态
let settings = {
    autoSummary: false,
    summaryFrequency: 20
};
let messageCounter = 0;
let isSummarizing = false;

// 获取SillyTavern的上下文
const context = getContext();

/**
 * 主初始化函数
 */
async function onStLoad() {
    // 1. 加载我们插件的HTML内容
    const panelHtmlUrl = `/extensions/${context.name}/index.html`;
    const panelHtml = await fetch(panelHtmlUrl).then(res => res.text());

    // 2. 创建并插入浮动面板的容器
    const panelContainer = document.createElement('div');
    panelContainer.id = PANEL_ID;
    panelContainer.innerHTML = panelHtml;
    // 默认隐藏
    panelContainer.style.display = 'none'; 
    // 添加到SillyTavern的主体部分
    document.body.appendChild(panelContainer);

    // 3. 在左下角的扩展菜单中创建入口
    // 找到SillyTavern的扩展菜单容器
    const extensionsMenu = document.getElementById('extensions_menu');
    if (extensionsMenu) {
        const menuItem = document.createElement('div');
        menuItem.className = 'list-group-item';
        menuItem.innerHTML = `<i class="fa-solid fa-brain"></i><p>长期记忆面板</p>`;
        
        // 点击菜单项时，切换面板的显示/隐藏
        menuItem.addEventListener('click', () => {
            const panel = document.getElementById(PANEL_ID);
            isPanelVisible = !isPanelVisible;
            panel.style.display = isPanelVisible ? 'block' : 'none';
        });
        
        extensionsMenu.appendChild(menuItem);
    } else {
        console.error('[Long Term Memory] Could not find extensions menu container!');
    }
    
    // 4. 为面板内的元素绑定事件
    bindPanelEvents();
    
    // 5. 加载设置并启动自动化监听器
    loadSettings();
    context.eventSource.on('message-generated', onMessageUpdate);

    console.log('[Long Term Memory] Extension loaded successfully!');
}

/**
 * 为面板内的按钮等元素绑定事件
 */
function bindPanelEvents() {
    const manualSummaryBtn = document.getElementById('manual-summary-btn');
    const autoSummaryToggle = document.getElementById('auto-summary-toggle');
    const summaryFrequencyInput = document.getElementById('summary-frequency');

    if (!manualSummaryBtn || !autoSummaryToggle || !summaryFrequencyInput) {
        console.error('[Long Term Memory] Panel elements not found!');
        return;
    }

    manualSummaryBtn.addEventListener('click', () => {
        generateAndSaveMemory(Number(summaryFrequencyInput.value));
    });

    autoSummaryToggle.addEventListener('change', (event) => {
        settings.autoSummary = event.target.checked;
        saveSettings();
        messageCounter = 0;
    });

    summaryFrequencyInput.addEventListener('change', (event) => {
        settings.summaryFrequency = Number(event.target.value);
        saveSettings();
    });
}

// 后面所有的核心逻辑函数 (generateAndSaveMemory, onMessageUpdate, loadSettings, saveSettings)
// 和我们之前写的版本几乎完全一样。为了完整性，请全部复制。

async function generateAndSaveMemory(messageCount) {
    if (isSummarizing) {
        console.log("[Long Term Memory] Summarization already in progress.");
        return;
    }
    isSummarizing = true;
    const manualBtn = document.getElementById('manual-summary-btn');
    if(manualBtn) {
        manualBtn.textContent = '正在生成...';
        manualBtn.disabled = true;
    }

    try {
        const history = (await chat.getHistory())?.slice(-messageCount);
        if (!history || history.length < 5) {
            callPopup("聊天记录太少，无法生成有意义的记忆。", 'info');
            return;
        }
        let historyText = "";
        history.forEach(msg => {
            if (msg.is_user || !msg.is_system) {
                historyText += `${msg.name}: ${msg.mes}\n`;
            }
        });
        if (historyText.trim() === "") return;
        const prompt = `[SYSTEM] You are a story archivist... (省略，和之前一样)`;
        const response = await fetch(`${context.getApiUrl()}/api/v1/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Auth': 'bypass' },
            body: JSON.stringify({
                prompt: prompt, max_new_tokens: 150, temperature: 0.5, top_p: 0.9,
            }),
        });

        if (!response.ok) throw new Error(`API returned status ${response.status}`);

        const data = await response.json();
        const summaryText = data.results[0].text.trim();
        if (!summaryText) return;

        const newEntry = {
            key: `Memory - ${new Date().toLocaleDateString()}`,
            content: `On ${new Date().toLocaleString()}, the following events occurred: ${summaryText}`,
            comment: '由长期记忆插件自动生成',
            case_sensitive: false, selective: true, secondary_keys: [], position: "after_char", enabled: true
        };
        await addWorldEntry(newEntry);
        callPopup(`新的记忆已存档！`, 'success');
    } catch (error) {
        console.error("[Long Term Memory] Error during summarization:", error);
        callPopup(`生成记忆时出错: ${error.message}`, 'error');
    } finally {
        isSummarizing = false;
        if(manualBtn) {
            manualBtn.textContent = '手动生成记忆';
            manualBtn.disabled = false;
        }
    }
}

function onMessageUpdate() {
    if (!settings.autoSummary || isSummarizing) return;
    messageCounter++;
    if (messageCounter >= settings.summaryFrequency) {
        console.log(`[Long Term Memory] Auto-summary triggered.`);
        generateAndSaveMemory(settings.summaryFrequency);
        messageCounter = 0;
    }
}

function loadSettings() {
    const savedSettings = localStorage.getItem('longTermMemorySettings');
    if (savedSettings) {
        settings = { ...settings, ...JSON.parse(savedSettings) };
    }
    // 应用到UI
    const autoToggle = document.getElementById('auto-summary-toggle');
    const freqInput = document.getElementById('summary-frequency');
    if (autoToggle) autoToggle.checked = settings.autoSummary;
    if (freqInput) freqInput.value = settings.summaryFrequency;
}

function saveSettings() {
    localStorage.setItem('longTermMemorySettings', JSON.stringify(settings));
}


// 插件启动入口
onStLoad();
