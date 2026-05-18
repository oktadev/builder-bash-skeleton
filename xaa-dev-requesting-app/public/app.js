const btn = document.getElementById('callBtn');
const out = document.getElementById('result');

if (btn) {
  btn.addEventListener('click', async () => {
    const mode = document.querySelector('input[name="mode"]:checked')?.value ?? 'normal';
    out.textContent = `Running ${mode} flow...`;
    btn.disabled = true;

    try {
      const res = await fetch('/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      out.textContent = JSON.stringify(json, null, 2);
    } catch (err) {
      out.textContent = `Error: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
}
