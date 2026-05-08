export function speechRecognitionErrorMessage(errorCode: string | undefined): string {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone is blocked. Allow microphone access for this site, then try again.";
    case "no-speech":
      return "I did not catch anything. Try again a little closer to the microphone.";
    case "audio-capture":
      return "No microphone was found. Check your microphone, then try again.";
    case "network":
      return "Speech recognition is offline right now. You can still type your message.";
    case "aborted":
      return "Voice input stopped before anything was captured.";
    default:
      return "Voice input could not start. You can still type your message.";
  }
}
