export function failClosedFetch(vi) {
  const unexpected = [];
  const mock = vi.fn((...args) => {
    unexpected.push(args);
    return Promise.reject(new Error("Unexpected network request"));
  });
  mock.unexpectedCalls = unexpected;
  return mock;
}

export function jsonResponse(vi, value, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({ "content-type": "application/json" }),
    json: vi.fn().mockResolvedValue(value),
    text: vi.fn(),
  };
}
