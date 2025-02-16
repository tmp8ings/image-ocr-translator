function createBody(tnote, prompt, imageBase64) {

  const generation_config = {
    maxOutputTokens: 8192,
    temperature: 0,
  };
  const safetySettings = [
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
  ];

  // Process each block
  const { systemInstruction, contents } = risuToGemini(prompt, tnote, imageBase64);

  return { generation_config, safetySettings, systemInstruction, contents };
}

const getBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Remove data:image/jpeg;base64, from the string
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

const translateContent = async (tnote, prompt) => {
  const loadingElement = document.getElementById("loading");
  const outputElement = document.getElementById("output");
  const translateButton = document.getElementById("translateButton");
  if (translateButton) translateButton.disabled = true;

  try {
    if (loadingElement) {
      // Use CSS spinner without inserting HTML markup
      loadingElement.style.display = "block";
    }
    // Hide the text result element during loading
    if (outputElement) {
      outputElement.style.display = "none";
      // Remove all extra nodes leaving the spinner (with id "loading")
      while (outputElement.childNodes.length > 1) {
        outputElement.removeChild(outputElement.lastChild);
      }
    }

    if (!window.apiKey) {
      if (outputElement) {
        outputElement.innerHTML = "Please set API key first";
      }
      return;
    }
    let imageBase64 = null;
    console.log(imageInput.files);
    if (prompt.includes('{{slot::image}}')) {
      const imageInput = document.getElementById('imageInput');
      if (imageInput.files.length > 0) {
        imageBase64 = await getBase64(imageInput.files[0]);
      } else {
        throw new Error("Image required but not provided");
      }
    }
    const model = document.getElementById("modelSelect").value;
    const body = createBody(tnote, prompt, imageBase64);
    console.log(body);

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${window.apiKey}`, {
        method: "POST",
        credentials: "omit",
        headers: {
          "accept": "*/*",
          "content-type": "application/json",
          "sec-fetch-mode": "cors",
          "origin": window.location.origin
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Network response was not ok\n${text}`);
      }
      const symbols = await response.json();
      let result = symbols.candidates[0].content.parts[0].text;
      result = result.replace(/<[^>]*>/g, '').trim();
      console.log(result);
      // Show the output element with the result text
      if (outputElement) {
        outputElement.style.display = "block";
        outputElement.innerHTML = result;
      }
      return result;
    } catch (networkError) {
      if (networkError.message.includes('CORS')) {
        throw new Error("CORS error - Make sure you're using HTTPS");
      }
      throw networkError;
    }
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = `${error}` ?? "Error fetching data.";
    if (outputElement) {
      outputElement.style.display = "block";
      outputElement.innerHTML = error.message.includes('CORS') ?
        "CORS error - Please ensure you're using HTTPS" :
        errorMessage;
    }
  } finally {
    if (loadingElement) {
      loadingElement.style.display = "none";
    }
    // Re-enable the translate button when loading is finished
    if (translateButton) translateButton.disabled = false;
  }
}

function risuToGemini(prompt, tnote, imageBase64) {
  prompt = prompt.replaceAll('{{slot::tnote}}', tnote);
  const { systemInstruction, contents } = risuToChatBlock(prompt);
  const imageAddedContents = contents.map(block => {
    const parts = block.parts.map(part => {
      if (part.text == '{{slot::image}}') {
        return {
          inline_data: {
            mime_type: "image/jpeg",
            data: imageBase64
          }
        }
      }
      return part;
    });
    return { role: block.role, parts };
  });
  return { systemInstruction, contents: imageAddedContents };
}

function chatBlockToGemini(systemInstruction, contents, tnote, imageBase64) {
  const risu = chatBlockToRisu(systemInstruction, contents);
  return risuToGemini(risu, tnote, imageBase64);
}

function risuToChatBlock(prompt) {
  const blocks = prompt.match(/<\|im_start\|>(.*?)<\|im_end\|>/gs) || [];
  const tempContents = [];
  const result = {
    contents: [],
    systemInstruction: '',
  }
  blocks.forEach(block => {
    const cleanBlock = block.replace(/<\|im_start\|>|\n?<\|im_end\|>/g, '');
    const [role, ...message] = cleanBlock.split('\n');
    const text = message.join('\n').trim();

    if (role.startsWith('system')) {
      result.systemInstruction = {
        parts: [{ text }]
      };
    } else if (role.startsWith('assistant')) {
      const hasThoughts = text.includes('<Thoughts>');
      let cleanThoughts = null;
      if (hasThoughts) {
        const [thoughts, response] = text.split('</Thoughts>');
        cleanThoughts = thoughts.replace('<Thoughts>', '');
        const trimmedResponse = response.trim();
        tempContents.push({
          role: 'MODEL',
          parts: [
            { text: cleanThoughts },
            { text: trimmedResponse || null }
          ]
        });
      } else {
        tempContents.push({
          role: 'MODEL',
          parts: [{ text }]
        });
      }
    } else if (role.startsWith('user')) {
      if (text.includes('{{slot::image}}')) {
        const [beforeImage, afterImage] = text.split('{{slot::image}}');
        const parts = [];
        if (beforeImage.trim()) {
          parts.push({ text: beforeImage.trim() });
        }
        parts.push({ text: '{{slot::image}}' });
        if (afterImage.trim()) {
          parts.push({ text: afterImage.trim() });
        }
        tempContents.push({
          role: 'USER',
          parts: parts
        });
      } else {
        tempContents.push({
          role: 'USER',
          parts: [{ text }]
        });
      }
    }
  });

  // Merge consecutive same roles
  for (let i = 0; i < tempContents.length; i++) {
    const current = tempContents[i];
    if (i === 0 || current.role !== tempContents[i - 1].role) {
      result.contents.push({
        role: current.role,
        parts: [...current.parts]
      });
    } else {
      result.contents[result.contents.length - 1].parts.push(...current.parts);
    }
  }

  return result;
}


function chatBlockToRisu(systemInstruction, contents) {
  let result = "";

  // 처리: systemInstruction 블록 추가
  if (systemInstruction && systemInstruction.parts) {
    const systemText = systemInstruction.parts
      .map(part => part.text)
      .filter(text => text !== undefined && text !== null)
      .join("\n");
    result += `<|im_start|>system\n${systemText}\n<|im_end|>\n`;
  }

  // 처리: contents 블록 각각 추가
  contents.forEach(block => {
    // MODEL 역할은 assistant로 변환, 그 외엔 소문자로 사용
    let roleLabel = block.role.toLowerCase();
    if (roleLabel === "model") {
      roleLabel = "assistant";
    }
    // 블록 내용을 결합 (inline_data는 고려하지 않음)
    const blockText = block.parts
      .map(part => part.text)
      .filter(text => text !== undefined && text !== null)
      .join("\n");
    result += `<|im_start|>${roleLabel}\n${blockText}\n<|im_end|>\n`;
  });

  return result.trim();
}