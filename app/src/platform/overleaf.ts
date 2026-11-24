import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { config } from '../config';
import { OVERLEAF_ENDPOINT, nativeOverleafUrl } from '../logic/overleaf';

/**
 * Opens a LaTeX snippet as a new Overleaf project.
 *
 * Web: posts a form in this tab so popup blockers cannot swallow the export.
 * Android/iOS: native apps cannot post a form, so we open our own hosted
 * page (public/overleaf.html) with the snippet in the URL fragment. The
 * fragment is not sent to the host; the helper posts only when tapped.
 */
export async function openInOverleaf(tex: string): Promise<void> {
  if (Platform.OS === 'web') {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = OVERLEAF_ENDPOINT;
    form.target = '_self';
    form.acceptCharset = 'UTF-8';
    form.rel = 'noreferrer';
    const add = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    add('encoded_snip', encodeURIComponent(tex));
    add('snip_name', 'main.tex');
    add('engine', 'pdflatex');
    document.body.appendChild(form);
    form.submit();
    form.remove();
    return;
  }
  await WebBrowser.openBrowserAsync(nativeOverleafUrl(config.webAppUrl, tex));
}
