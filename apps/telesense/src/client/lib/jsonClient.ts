export async function readJsonResponse<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

export async function readErrorText(response: Response): Promise<string> {
  return (await response.text()) || `Request failed with status ${response.status}`
}

export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  if (!response.ok) {
    throw new Error(await readErrorText(response))
  }
  return readJsonResponse<T>(response)
}

export async function postJson<T>(
  input: RequestInfo | URL,
  body?: unknown,
  init: RequestInit = {},
): Promise<T> {
  return fetchJson<T>(input, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers && !Array.isArray(init.headers)
        ? (init.headers as Record<string, string>)
        : {}),
    },
    body: body === undefined ? init.body : JSON.stringify(body),
  })
}
