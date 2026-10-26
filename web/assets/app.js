const form = document.querySelector('#chat-form');
const prompt = document.querySelector('#prompt');
const sendButton = document.querySelector('#send');
const messagesElement = document.querySelector('#messages');
const welcome = document.querySelector('#welcome');
const connection = document.querySelector('#connection');
const connectionLabel = document.querySelector('#connection-label');
const newChatButton = document.querySelector('#new-chat');

let history = [];
let activeController = null;

function scrollToLatest() {
  document.querySelector('.workspace').scrollTo({
    top: document.querySelector('.workspace').scrollHeight,
    behavior: 'smooth'
  });
}

function addMessage(role, content = '', options = {}) {
  welcome.hidden = true;
  const article = document.createElement('article');
  article.className = `message ${role}${options.error ? ' error' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'YOU' : 'AI';

  const body = document.createElement('div');
  body.className = 'message-body';
  const bubble = document.createElement('div');
  bubble.className = `bubble${options.typing ? ' typing-cursor' : ''}`;
  bubble.textContent = content;
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  meta.textContent = options.meta || '';
  body.append(bubble, meta);
  article.append(avatar, body);
  messagesElement.append(article);
  scrollToLatest();
  return { article, bubble, meta };
}

async function updateHealth() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const health = await response.json();
    if (!response.ok) throw new Error(health.error || 'Local model unavailable');
    connection.className = 'connection online';
    const mode = health.knowledge?.mode || 'approved';
    const activeRecords = health.knowledge?.active_records ?? 0;
    const approvedRecords = health.knowledge?.approved_records ?? 0;
    connection.classList.toggle('testing', mode === 'pending_test');
    connectionLabel.textContent = mode === 'pending_test'
      ? `Phase 1 test · ${activeRecords} pending records`
      : approvedRecords
        ? `${health.model} · ${approvedRecords} approved records`
        : 'No approved knowledge loaded';
    connection.title = `Local ${health.provider} model: ${health.model}`;
    sendButton.disabled = !health.installed;
    if (!health.installed) connectionLabel.textContent = `${health.model} not installed`;
  } catch (error) {
    connection.className = 'connection offline';
    connectionLabel.textContent = 'Model offline';
    connection.title = error.message;
    sendButton.disabled = true;
  }
}

async function streamResponse() {
  activeController = new AbortController();
  sendButton.disabled = true;
  const responseMessage = addMessage('assistant', '', { typing: true, meta: 'Preparing local response…' });
  const started = performance.now();

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: history }),
      signal: activeController.signal
    });
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || `Request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let completeAnswer = '';

    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'status') responseMessage.meta.textContent = event.message;
        if (event.type === 'token') {
          completeAnswer += event.content;
          responseMessage.bubble.textContent = completeAnswer;
          responseMessage.meta.textContent = 'Responding locally…';
          scrollToLatest();
        }
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'done') {
          responseMessage.meta.textContent = `Local model · ${(event.elapsed_ms / 1000).toFixed(1)}s`;
        }
      }
      if (done) break;
    }

    if (!completeAnswer.trim()) throw new Error('The model returned an empty response');
    responseMessage.bubble.classList.remove('typing-cursor');
    history.push({ role: 'assistant', content: completeAnswer.trim() });
  } catch (error) {
    responseMessage.article.remove();
    if (error.name !== 'AbortError') {
      addMessage('assistant', `Unable to complete the request: ${error.message}`, { error: true });
    }
  } finally {
    activeController = null;
    sendButton.disabled = false;
    prompt.focus();
    await updateHealth();
    const elapsed = Math.round((performance.now() - started) / 1000);
    if (elapsed > 1 && !responseMessage.meta.textContent) responseMessage.meta.textContent = `${elapsed}s`;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const content = prompt.value.trim();
  if (!content || activeController) return;
  addMessage('user', content);
  history.push({ role: 'user', content });
  prompt.value = '';
  prompt.style.height = 'auto';
  await streamResponse();
});

prompt.addEventListener('input', () => {
  prompt.style.height = 'auto';
  prompt.style.height = `${Math.min(prompt.scrollHeight, 160)}px`;
});

prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll('[data-prompt]').forEach(button => {
  button.addEventListener('click', () => {
    prompt.value = button.dataset.prompt;
    prompt.dispatchEvent(new Event('input'));
    prompt.focus();
  });
});

newChatButton.addEventListener('click', () => {
  activeController?.abort();
  history = [];
  messagesElement.replaceChildren();
  welcome.hidden = false;
  prompt.value = '';
  prompt.focus();
});

updateHealth();
setInterval(updateHealth, 30000);

