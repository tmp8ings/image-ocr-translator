// Global flag for style tracking
let isChatBlockEnabled = false;

// window.onload event handler
window.onload = function () {
    const params = new URLSearchParams(window.location.search);
    const key = localStorage.getItem("apiKey");
    const prompt = params.get("prompt") || localStorage.getItem("prompt");
    const tnote = params.get("tnote") || localStorage.getItem("tnote");
    const modelParam = params.get("model") || localStorage.getItem("model");

    if (key) {
        document.getElementById("apiKey").value = key;
        window.apiKey = key;
        document.getElementById("output").textContent = "API Key loaded";
        localStorage.setItem("apiKey", key);
    }
    if (modelParam) {
        document.getElementById("modelSelect").value = modelParam;
        localStorage.setItem("model", modelParam);
    }
    if (prompt) {
        try {
            document.getElementById("content").value = decodeURIComponent(prompt);
            localStorage.setItem("prompt", prompt);
        } catch (e) {
            console.error("Error decoding prompt:", e);
        }
    }
    if (tnote) {
        document.getElementById("tnote").value = decodeURIComponent(tnote);
        localStorage.setItem("tnote", tnote);
    }

    loadStylePreference(params);
};

function loadStylePreference(params) {
    const styleParam = params.get("style") || localStorage.getItem("style");
    if (styleParam === "chatblock") {
        isChatBlockEnabled = true;
        document.getElementById("styleToggle").checked = true;
        document.getElementById("chatBlockContainer").style.display = "block";
        document.getElementById("content").style.display = "none";
        convertRisuToChatBlock();
    } else {
        isChatBlockEnabled = false;
        document.getElementById("styleToggle").checked = false;
        document.getElementById("chatBlockContainer").style.display = "none";
        document.getElementById("content").style.display = "block";
    }
    localStorage.setItem("style", isChatBlockEnabled ? "chatblock" : "risu");
}

function convertRisuToChatBlock() {
    const risuPrompt = document.getElementById("content").value;
    const { systemInstruction, contents } = risuToChatBlock(risuPrompt);
    document.getElementById("systemInstruction").value = 
        (systemInstruction && systemInstruction.parts[0]?.text) || "";
    const container = document.getElementById("chatContentBlocks");
    container.innerHTML = "";
    contents.forEach(block => {
        const row = document.createElement("div");
        row.className = "chatBlockRow";
        row.innerHTML = `
            <select class="chatBlockRoleSelect">
                <option value="user" ${block.role === "USER" ? "selected" : ""}>User</option>
                <option value="assistant" ${block.role === "MODEL" ? "selected" : ""}>Assistant</option>
            </select>
            <textarea class="chatBlockText" oninput="updateUrl()">${block.parts.map(p => p.text).join("\n")}</textarea>
        `;
        container.appendChild(row);
    });
}

function setApiKey() {
    const key = document.getElementById("apiKey").value;
    const content = document.getElementById("content").value;
    const tnote = document.getElementById("tnote").value;
    const model = document.getElementById("modelSelect").value;
    if (key) {
        window.apiKey = key;
        localStorage.setItem("apiKey", key);
        if (content) {
            localStorage.setItem("prompt", encodeURIComponent(content));
        }
        if (tnote) {
            localStorage.setItem("tnote", encodeURIComponent(tnote));
        }
        localStorage.setItem("model", model);
        const newUrl = window.location.pathname + "?model=" + encodeURIComponent(model);
        window.history.pushState({}, "", newUrl);
        document.getElementById("output").textContent = "API Key set successfully";
    } else {
        document.getElementById("output").textContent = "Please enter an API key";
    }
}

function updateUrl() {
    if (window.apiKey) {
        const promptArea = document.getElementById("content");
        let content;
        if (isChatBlockEnabled) {
            const systemInstruction = document.getElementById("systemInstruction").value;
            const blocks = [...document.querySelectorAll("#chatContentBlocks .chatBlockRow")].map(row => {
                const role = row.querySelector(".chatBlockRoleSelect").value;
                const text = row.querySelector(".chatBlockText").value;
                return { role: role.toUpperCase(), parts: [{ text }] };
            });
            content = chatBlockToRisu({ parts: [{ text: systemInstruction }] }, blocks);
            promptArea.value = content;
        } else {
            content = promptArea.value;
        }

        const tnote = document.getElementById("tnote").value;
        const model = document.getElementById("modelSelect").value;
        localStorage.setItem("prompt", encodeURIComponent(content));
        localStorage.setItem("tnote", encodeURIComponent(tnote));
        localStorage.setItem("model", model);
        const styleFlag = isChatBlockEnabled ? "chatblock" : "risu";
        localStorage.setItem("style", styleFlag);
        const newUrl = window.location.pathname + "?model=" + encodeURIComponent(model) + "&style=" + styleFlag;
        window.history.pushState({}, "", newUrl);
    }
}

function startTranslation() {
    let contentToTranslate;
    if (!isChatBlockEnabled) {
        const content = document.getElementById("content").value;
        if (!content) {
            document.getElementById("output").textContent = "Please enter content to translate";
            return;
        }
        contentToTranslate = content;
    } else {
        const systemInstruction = document.getElementById("systemInstruction").value;
        const blocks = [...document.querySelectorAll("#chatContentBlocks .chatBlockRow")].map((row) => {
            const role = row.querySelector(".chatBlockRoleSelect").value;
            const text = row.querySelector(".chatBlockText").value;
            return { role, text };
        });
        const chatBlock = {
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents: blocks.map((b) => ({
                role: b.role.toUpperCase(),
                parts: [{ text: b.text }],
            })),
        };
        contentToTranslate = chatBlockToRisu(
            chatBlock.systemInstruction,
            chatBlock.contents
        );
        document.getElementById("content").value = contentToTranslate;
    }
    const model = document.getElementById("modelSelect").value;
    const tnote = document.getElementById("tnote").value;
    translateContent(tnote, contentToTranslate, model);
}

// Image handling functions
function previewImage(input) {
    const preview = document.getElementById("imagePreview");
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            preview.src = e.target.result;
            preview.style.display = "block";
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.style.display = "none";
    }
}

function compressImage(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function (e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function () {
            const canvas = document.createElement("canvas");
            const scaleFactor = 0.7;
            canvas.width = img.width * scaleFactor;
            canvas.height = img.height * scaleFactor;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                function (blob) {
                    callback(blob);
                },
                "image/jpeg",
                0.7
            );
        };
    };
}

function handleImageFile(file) {
    console.log("getting immage...");
    console.log(file.size);
    if (file.size > 15 * 1024 * 1024) {
        console.log("need to compress!");
        compressImage(file, function (compressedBlob) {
            const compressedFile = new File([compressedBlob], file.name, {
                type: "image/jpeg",
            });
            const imageInput = document.getElementById("imageInput");
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(compressedFile);
            imageInput.files = dataTransfer.files;
            previewImage(imageInput);
        });
    } else {
        const imageInput = document.getElementById("imageInput");
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        imageInput.files = dataTransfer.files;
        previewImage(imageInput);
    }
}

function togglePromptStyle() {
    const promptArea = document.getElementById("content");
    const chatBlockContainer = document.getElementById("chatBlockContainer");
    if (!this || !document.getElementById("styleToggle").checked) {
        if (isChatBlockEnabled) {
            const systemInstruction = document.getElementById("systemInstruction").value;
            const blocks = [...document.querySelectorAll("#chatContentBlocks .chatBlockRow")].map(row => {
                const role = row.querySelector(".chatBlockRoleSelect").value;
                const text = row.querySelector(".chatBlockText").value;
                return { role: role.toUpperCase(), parts: [{ text }] };
            });
            const risu = chatBlockToRisu({ parts: [{ text: systemInstruction }] }, blocks);
            promptArea.value = risu;
            chatBlockContainer.style.display = "none";
            promptArea.style.display = "block";
            isChatBlockEnabled = false;
            updateUrl();
        }
    } else {
        if (!isChatBlockEnabled) {
            convertRisuToChatBlock();
            chatBlockContainer.style.display = "block";
            promptArea.style.display = "none";
            isChatBlockEnabled = true;
            updateUrl();
        }
    }
}

function addChatBlock() {
    const container = document.getElementById("chatContentBlocks");
    const row = document.createElement("div");
    row.className = "chatBlockRow";
    row.innerHTML = `
        <select class="chatBlockRoleSelect">
            <option value="user">User</option>
            <option value="assistant">Assistant</option>
        </select>
        <textarea class="chatBlockText" placeholder="Enter text" oninput="updateUrl()"></textarea>
    `;
    container.appendChild(row);
    updateUrl();
}

// Event Listeners
document.addEventListener("paste", function (e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
        if (item.type.indexOf("image") !== -1) {
            const file = item.getAsFile();
            handleImageFile(file);
            break;
        }
    }
});

document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.key === "Enter") {
        startTranslation();
    }
});

document.addEventListener("DOMContentLoaded", function() {
    const dropZone = document.getElementById("dropZone");
    const modelSelect = document.getElementById("modelSelect");
    const styleToggle = document.getElementById("styleToggle");

    dropZone.addEventListener("click", () => {
        document.getElementById("imageInput").click();
    });

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith("image/")) {
            handleImageFile(files[0]);
        }
    });

    modelSelect.addEventListener("change", updateUrl);
    styleToggle.addEventListener("change", togglePromptStyle);
});
