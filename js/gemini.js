function createBody(tnote, prompt, imageBase64) {
  // Parse blocks using regex
  const blocks = prompt.match(/<\|im_start\|>(.*?)<\|im_end\|>/gs) || [];

  // Initialize structure
  const body = {
    contents: [],
    generation_config: {
      maxOutputTokens: 8192,
      temperature: 0,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
    ]
  };

  // Process each block
  const tempContents = [];
  blocks.forEach(block => {
    const cleanBlock = block.replace(/<\|im_start\|>|\n?<\|im_end\|>/g, '');
    const [role, ...message] = cleanBlock.split('\n');
    const text = message.join('\n').trim();

    if (role.startsWith('system')) {
      body.systemInstruction = {
        parts: [{ text: text.replace('{{slot::tnote}}', tnote) }]
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
        tempContents.push({
          role: 'USER',
          parts: [{
            inline_data: {
              mime_type: "image/jpeg",
              data: imageBase64
            }
          }]
        });
      } else {
        tempContents.push({
          role: 'USER',
          parts: [{ text: text.replace('{{slot::tnote}}', tnote) }]
        });
      }
    }
  });

  // Merge consecutive same roles
  for (let i = 0; i < tempContents.length; i++) {
    const current = tempContents[i];
    if (i === 0 || current.role !== tempContents[i - 1].role) {
      body.contents.push({
        role: current.role,
        parts: [...current.parts]
      });
    } else {
      body.contents[body.contents.length - 1].parts.push(...current.parts);
    }
  }

  return body;
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