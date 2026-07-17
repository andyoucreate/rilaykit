import { type TextPart, uiTools } from 'rilaykit';
import { r } from './ril-config';

/**
 * The catalog the agent demos share: the field components (from the shared `r`)
 * plus the UI tools (`show_form` / `show_flow` / `show_component`) and a text-part
 * renderer so assistant prose renders. The `ril` builder is immutable, so this
 * derives a new catalog without mutating `r`.
 */
export const agentCatalog = r.use(uiTools()).part<TextPart>('text', {
  renderer: ({ part }) => <p className="text-sm leading-relaxed text-foreground">{part.text}</p>,
});
