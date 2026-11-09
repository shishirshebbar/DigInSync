export class ApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly outcomeUnknown = false) {
    super(message);
    this.name = "ApiError";
  }
}

export function recoveryMessage(status: number | null, mutation: boolean): string {
  if (status === null) return mutation
    ? "The result could not be confirmed. Reload saved records to check whether it completed before submitting again."
    : "The server response could not be read. Check your connection and retry loading.";
  if (status === 403) return "Local-demo changes are unavailable for this connection. Use a direct local connection with demo review enabled; saved records remain readable.";
  if (status === 409) return "Reload the saved proposal, then save and review a fresh revision before deciding. Your current edits have been kept on screen.";
  if (status === 422) return "Review the entered fields and dates, then submit again.";
  if (status === 429) return "The provider is temporarily rate limited. Wait before trying again; manual project entry remains available.";
  if (status >= 500) return mutation
    ? "The server could not complete the response. Check saved records before resubmitting. Manual entry and deterministic coordination are available when AI is unavailable."
    : "The service is temporarily unavailable. Retry loading when it is available.";
  return "Review the message and retry when the issue is resolved.";
}
