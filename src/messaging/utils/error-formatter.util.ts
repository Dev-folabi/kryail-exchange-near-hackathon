/**
 * Format error messages in a conversational, user-friendly way
 */
export function formatErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();

  // Network/connection errors
  if (
    message.includes("network") ||
    message.includes("econnrefused") ||
    message.includes("timeout") ||
    message.includes("enotfound")
  ) {
    return "Oops! I'm having trouble connecting right now. Please try again in a moment.";
  }

  // Validation errors
  if (
    message.includes("validation") ||
    message.includes("invalid") ||
    message.includes("required")
  ) {
    return "It looks like some information is missing or incorrect. Could you check and try again?";
  }

  // Rate limit errors
  if (message.includes("rate limit") || message.includes("too many")) {
    return "You're moving fast! Please wait a moment before trying again.";
  }

  // Authentication errors
  if (
    message.includes("unauthorized") ||
    message.includes("authentication") ||
    message.includes("forbidden")
  ) {
    return "I need to verify your identity first. Please verify with your pin.";
  }

  // Insufficient balance
  if (message.includes("insufficient") || message.includes("balance")) {
    return "It looks like you don't have enough funds for this transaction. Please check your balance and try again.";
  }

  // Generic fallback
  return "Something went wrong on our end. We're looking into it. Please try again shortly.";
}
