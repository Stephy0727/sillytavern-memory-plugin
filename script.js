// 这是插件的JS代码文件

// 等待SillyTavern加载完毕
jQuery(async () => {
    // 导入SillyTavern的API，这样我们才能和主程序交互
    const {
        getApiUrl,
        getCharacterAvatar,
        getMesBG,
        getSendMeth,
        getToken,
        modules,
        chat,
        characters,
        addWorldEntry, // 关键API：添加世界书条目
        world_info,
        this_chid,
        main_api,
        token,
        callPopup
    } = SillyTavern.getContext();

    // 插件设置的默认值
    let settings = {
        autoSummary: false,
        summaryFrequency: 20
    };

    // 获取界面元素
    const manualSummaryBtn = document.getElementById('manual-summary-btn');
    const autoSummaryToggle = document.getElementById('auto-summary-toggle');
    const summaryFrequencyInput = document.getElementById('summary-frequency');

    // ---- 功能函数 ----

    /**
     * 这是插件的核心：生成并保存记忆
     * @param {number} messageCount - 要总结的消息数量
     */
    async function generateAndSaveMemory(messageCount = 10) {
        // 1. 获取最近的聊天记录
        const history = (await chat.getHistory())?.slice(-messageCount);
        if (!history || history.length === 0) {
            callPopup("没有足够的聊天记录来生成记忆。", 'text');
            return;
        }
        
        let historyText = "";
        history.forEach(msg => {
            historyText += `${msg.name}: ${msg.mes}\n`;
        });

        // 2. 构建一个请求，让AI来总结这段对话
        // 这是给AI的指示，告诉它要做什么
        const prompt = `[SYSTEM] Please summarize the following conversation, focusing on key events, new information, and changes in character relationships. The summary should be concise and written in the third person, like a lorebook entry.
        
        Conversation:
        ${historyText}
        
        Summary:`;

        callPopup("正在请求AI生成记忆总结，请稍候...", 'text');

        // 3. 发送请求给SillyTavern连接的AI API
        // 这是最关键的一步，也是可能导致卡顿的地方，我们后续会优化
        try {
            const response = await fetch(`${getApiUrl()}/api/v1/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Bypass-Tunnel-Auth': 'bypass'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    max_new_tokens: 150, // 限制总结的长度
                    temperature: 0.7, // 让总结更多样化一点
                    // 可以在这里添加更多你API支持的参数
                }),
            });

            if (!response.ok) {
                throw new Error(`API 请求失败，状态码: ${response.status}`);
            }

            const data = await response.json();
            const summaryText = data.results[0].text.trim();

            if (!summaryText) {
                callPopup("AI返回的总结为空。", 'error');
                return;
            }

            // 4. 将总结存入世界书
            const newEntry = {
                key: `Memory - ${new Date().toLocaleString()}`, // 用时间作为key，保证唯一性
                content: summaryText,
                comment: '由长期记忆插件自动生成',
                case_sensitive: false,
                selective: true,
                secondary_keys: [],
                position: "after_char",
                enabled: true
            };

            await addWorldEntry(newEntry);
            callPopup(`成功创建新的记忆条目！\n\n内容：\n${summaryText}`, 'text');

        } catch (error) {
            console.error("生成记忆时出错:", error);
            callPopup(`生成记忆时出错: ${error.message}`, 'error');
        }
    }

    // ---- 事件监听 ----

    // 监听“手动生成记忆”按钮的点击事件
    manualSummaryBtn.addEventListener('click', () => {
        // 手动触发时，我们总结最近的20条消息
        generateAndSaveMemory(20); 
    });

    // （自动化的部分我们将在下一步实现）

    console.log("长期记忆插件已加载！");
});
