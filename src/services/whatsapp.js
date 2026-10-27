const config = require('../config');
const base = `https://graph.facebook.com/${config.WHATSAPP_GRAPH_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
async function post(payload) {
  const response = await fetch(base, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`WhatsApp API returned ${response.status}`);
    error.status = response.status;
    error.detail = data.error?.message;
    throw error;
  }
  return data;
}
const text = (to, body) => post({ to, type: 'text', text: { body, preview_url: false } });
const buttons = (to, body, items) => post({
  to, type: 'interactive',
  interactive: {
    type: 'button', body: { text: body },
    action: { buttons: items.slice(0, 3).map((x) => ({ type: 'reply', reply: { id: x.id, title: x.title.slice(0, 20) } })) }
  }
});
const list = (to, body, buttonText, rows) => post({
  to, type: 'interactive',
  interactive: {
    type: 'list', body: { text: body },
    action: { button: buttonText.slice(0, 20), sections: [{ title: 'Options', rows: rows.slice(0, 10).map((x) => ({ id: x.id, title: x.title.slice(0, 24), ...(x.description ? { description: x.description.slice(0, 72) } : {}) })) }] }
  }
});
const template = (to, name, language, components = []) => post({ to, type: 'template', template: { name, language: { code: language }, components } });
const image = (to, link, caption) => post({ to, type: 'image', image: { link, ...(caption ? { caption } : {}) } });
const document = (to, link, filename, caption) => post({ to, type: 'document', document: { link, filename, ...(caption ? { caption } : {}) } });
const markRead = (messageId) => post({ status: 'read', message_id: messageId });
module.exports = { text, buttons, list, template, image, document, markRead };
