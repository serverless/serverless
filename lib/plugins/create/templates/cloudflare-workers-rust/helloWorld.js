addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  try {
    await wasm_bindgen(WASM);
    return new Response(wasm_bindgen.hello());
  } catch (e) {
    return new Response(JSON.stringify(e.message));
  }
}
