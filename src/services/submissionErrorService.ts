/**
 * Global Submission Error Service
 * Provides a centered modal dialog for submission failures
 * that requires clicking "Confirm" to dismiss.
 */

type ErrorListener = (message: string) => void;

const listeners: ErrorListener[] = [];

export function showSubmissionError(message: string) {
  listeners.forEach(listener => listener(message));
}

export function onSubmissionError(listener: ErrorListener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
}
