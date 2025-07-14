import type { ComponentRendererWrapperProps } from '../types';
import { resolveRendererChildren } from '../utils/componentHelpers';

export function ComponentRendererWrapper<TProps = any>({
  children,
  renderAs,
  renderer,
  name,
  props: baseProps,
}: ComponentRendererWrapperProps<TProps>) {
  const shouldUseChildrenAsRenderer = renderAs === 'children' || renderAs === true;

  if (shouldUseChildrenAsRenderer) {
    if (typeof children !== 'function') {
      throw new Error(
        `When renderAs="children" is used, children must be a function that returns React elements for ${name}`
      );
    }

    return children(baseProps);
  }

  if (!renderer) {
    throw new Error(`No renderer provided for ${name}`);
  }

  if (typeof renderer !== 'function') {
    throw new Error(`Renderer must be a function for ${name}`);
  }

  const props: TProps = {
    ...baseProps,
    children: resolveRendererChildren(children, baseProps),
  };

  return renderer(props);
}

export default ComponentRendererWrapper;
