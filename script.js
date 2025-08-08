jQuery(async () => {
    // 导入SillyTavern的API
    const {
        getApiUrl,
        callPopup,
        chat,
        addWorldEntry
    } = SillyTavern.getContext();

    // 插件设置的默认值
    let settings = {
        autoSummary: false,
        summaryFrequency: 20
    };
    let messageCounter = 0; // 用于自动总结的消息计数器
    let isSummarizing = false; // 一个“锁”，防止在总结时再次触发

    // ---- 获取并绑定UI元素 ----
    const manualSummaryBtn = document.getElementById('manual-summary-btn');
    const autoSummaryToggle = document.getElementById('auto-summary-toggle');
    const summaryFrequencyInput = document.getElementById('summary-frequency');

    // ---- 功能函数 ----

    /**
     * 核心功能：生成并保存记忆
     * @param {number} messageCount - 要总结的消息数量
     */
    async function generateAndSaveMemory(messageCount) {
        if (isSummarizing) {
            console.log("长期记忆插件：已有一个总结任务正在进行，本次跳过。");
            return;
        }

        // 上锁
        isSummarizing = true;
        // 在UI上给用户一个反馈
        manualSummaryBtn.textContent = '正在生成...';
        manualSummaryBtn.disabled = true;

        try {
            const history = (await chat.getHistory())?.slice(-messageCount);
            if (!history || history.length < 5) { // 至少有5条消息才总结
                callPopup("聊天记录太少，无法生成有意义的记忆。", 'info');
                return; // 直接退出，不执行后续操作
            }

            let historyText = "";
            history.forEach(msg => {
                // 只包含用户和角色的消息，忽略系统消息
                if (msg.is_user || !msg.is_system) {
                    historyText += `${msg.name}: ${msg.mes}\n`;
                }
            });

            // 如果处理后文本为空，也退出
            if (historyText.trim() === "") {
                return;
            }

            const prompt = `[SYSTEM] You are a story archivist. Your task is to summarize the following conversation part. Extract key events, plot points, newly revealed information, and significant changes in character states or relationships. The summary must be concise, neutral, and written in the third person, suitable for a lorebook entry.

            Conversation to Summarize:
            ${historyText}
            
            Concise Lorebook Summary:`;
            
            // 使用SillyTavern的内置API请求方法，更稳定
            const response = await fetch(`${getApiUrl()}/api/v1/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Auth': 'bypass' },
                body: JSON.stringify({
                    prompt: prompt,
                    max_new_tokens: 150,
                    temperature: 0.5,
                    top_p: 0.9,
                    // 减少不必要的参数，让请求更轻量
                }),
            });

            if (!response.ok) throw new Error(`API returned status ${response.status}`);

            const data = await response.json();
            const summaryText = data.results[0].text.trim();

            if (!summaryText) {
                 console.warn("AI返回的总结为空。");
                 return;
            }

            const newEntry = {
                key: `Memory - ${new Date().toLocaleDateString()}`, // Key可以重复，内容会被新的覆盖更新
                content: `On ${new Date().toLocaleString()}, the following events occurred: ${summaryText}`,
                comment: '由长期记忆插件自动生成',
                case_sensitive: false,
                selective: true,
                secondary_keys: [],
                position: "after_char",
                enabled: true
            };

            await addWorldEntry(newEntry);
            callPopup(`新的记忆已存档！`, 'success');

        } catch (error) {
            console.error("长期记忆插件 - 生成记忆时出错:", error);
            callPopup(`生成记忆时出错: ${error.message}`, 'error');
        } finally {
            // 不论成功还是失败，都要“开锁”并恢复按钮状态
            isSummarizing = false;
            manualSummaryBtn.textContent = '手动生成记忆';
            manualSummaryBtn.disabled = false;
        }
    }
    
    // ---- 自动化逻辑 ----
    function onMessageUpdate() {
        if (!settings.autoSummary || isSummarizing) {
            return;
        }
        
        messageCounter++;
        
        if (messageCounter >= settings.summaryFrequency) {
            console.log(`长期记忆插件：已达到 ${settings.summaryFrequency} 条消息，触发自动总结。`);
            generateAndSaveMemory(settings.summaryFrequency);
            messageCounter = 0; // 重置计数器
        }
    }

    // ---- 设置的加载与保存 ----
    function loadSettings() {
        const savedSettings = localStorage.getItem('longTermMemorySettings');
        if (savedSettings) {
            settings = { ...settings, ...JSON.parse(savedSettings) };
        }
        // 将加载的设置应用到UI上
        autoSummaryToggle.checked = settings.autoSummary;
        summaryFrequencyInput.value = settings.summaryFrequency;
    }

    function saveSettings() {
        localStorage.setItem('longTermMemorySettings', JSON.stringify(settings));
    }
    
    // ---- 事件监听 ----
    manualSummaryBtn.addEventListener('click', () => {
        // 手动触发时，使用输入框中的频率值作为消息数量
        generateAndSaveMemory(Number(summaryFrequencyInput.value)); 
    });

    autoSummaryToggle.addEventListener('change', (event) => {
        settings.autoSummary = event.target.checked;
        saveSettings();
        messageCounter = 0; // 切换时重置计数器
    });

    summaryFrequencyInput.addEventListener('change', (event) => {
        settings.summaryFrequency = Number(event.target.value);
        saveSettings();
    });

    // 监听SillyTavern的消息生成事件，这是实现自动化的关键
    SillyTavern.extensionEvents.on('message-generated', onMessageUpdate);

    // ---- 插件初始化 ----
    loadSettings();
    console.log("长期记忆插件（优化版）已加载！");
});
