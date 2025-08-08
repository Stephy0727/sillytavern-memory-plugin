// 这是插件的JS代码文件 - 最终优化版 + 顶部菜单入口

jQuery(async () => {
    // 导入SillyTavern的API
    const {
        getApiUrl,
        callPopup,
        chat,
        addWorldEntry,
        // 新增：导入这个API来读取我们的HTML文件
        getExtensions,
    } = SillyTavern.getContext();

    // ---- 读取我们插件的HTML内容 ----
    // 找到我们自己的插件信息
    const extension = getExtensions().find(ext => ext.name === 'Long Term Memory');
    // 读取 index.html 文件的内容备用
    const viewHtml = await $.get(`${extension.path}/view.html`);

    // ---- 插件设置和状态 ----
    let settings = {
        autoSummary: false,
        summaryFrequency: 20
    };
    let messageCounter = 0;
    let isSummarizing = false;

    // ---- 创建顶部菜单按钮 ----
    const menuButton = $(`
        <div id="long-term-memory-menu" class="list-group-item">
            <i class="fa-solid fa-brain"></i>
            <p>长期记忆</p>
        </div>
    `);

    // 把按钮添加到顶部菜单栏的“工具”区域
    $('#extensions_menu').append(menuButton);

    // ---- 为按钮绑定点击事件 ----
    menuButton.on('click', () => {
        // 点击按钮时，弹出一个包含我们HTML内容的窗口
        callPopup(viewHtml, 'html', null, {
            // 这个 isContextMenu: true 是让弹窗更好看一点的技巧
            isContextMenu: true, 
            // 设置弹窗的标题
            title: "长期记忆管理", 
            // 弹窗宽度
            width: 400,
            // 当弹窗打开后，执行这个函数
            onload: () => {
                // 在弹窗加载后，我们才能获取里面的按钮并绑定事件
                bindPopupButtons();
            }
        });
    });


    // ---- 功能函数 ----

    /**
     * 这个函数现在专门用来绑定弹窗里的按钮事件
     */
    function bindPopupButtons() {
        // 获取弹窗内的元素
        const manualSummaryBtn = document.getElementById('manual-summary-btn');
        const autoSummaryToggle = document.getElementById('auto-summary-toggle');
        const summaryFrequencyInput = document.getElementById('summary-frequency');

        // 恢复UI状态
        autoSummaryToggle.checked = settings.autoSummary;
        summaryFrequencyInput.value = settings.summaryFrequency;
        if (isSummarizing) {
            manualSummaryBtn.textContent = '正在生成...';
            manualSummaryBtn.disabled = true;
        }

        // 绑定事件
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
    
    // ... (generateAndSaveMemory, onMessageUpdate, loadSettings, saveSettings 等函数保持不变) ...
    // 为了确保万无一失，下面是完整的函数代码，请直接复制粘贴，不要只复制上面的片段

    async function generateAndSaveMemory(messageCount) {
        if (isSummarizing) {
            console.log("长期记忆插件：已有一个总结任务正在进行，本次跳过。");
            return;
        }
        isSummarizing = true;
        // 更新弹窗内的按钮状态（如果弹窗是打开的）
        const manualBtnInPopup = document.getElementById('manual-summary-btn');
        if (manualBtnInPopup) {
            manualBtnInPopup.textContent = '正在生成...';
            manualBtnInPopup.disabled = true;
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
            const response = await fetch(`${getApiUrl()}/api/v1/generate`, {
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
            console.error("长期记忆插件 - 生成记忆时出错:", error);
            callPopup(`生成记忆时出错: ${error.message}`, 'error');
        } finally {
            isSummarizing = false;
            // 恢复弹窗内的按钮状态
            const manualBtnInPopup = document.getElementById('manual-summary-btn');
            if (manualBtnInPopup) {
                manualBtnInPopup.textContent = '手动生成记忆';
                manualBtnInPopup.disabled = false;
            }
        }
    }
    
    function onMessageUpdate() {
        if (!settings.autoSummary || isSummarizing) return;
        messageCounter++;
        if (messageCounter >= settings.summaryFrequency) {
            console.log(`长期记忆插件：触发自动总结。`);
            generateAndSaveMemory(settings.summaryFrequency);
            messageCounter = 0;
        }
    }

    function loadSettings() {
        const savedSettings = localStorage.getItem('longTermMemorySettings');
        if (savedSettings) {
            settings = { ...settings, ...JSON.parse(savedSettings) };
        }
    }

    function saveSettings() {
        localStorage.setItem('longTermMemorySettings', JSON.stringify(settings));
    }

    // 监听SillyTavern的消息生成事件
    SillyTavern.extensionEvents.on('message-generated', onMessageUpdate);

    // 插件初始化
    loadSettings();
    console.log("长期记忆插件（顶部菜单版）已加载！");
});
