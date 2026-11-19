import type { TermHubApi } from '../shared/types';

declare global {
  interface Window {
    termhub: TermHubApi;
  }
}
