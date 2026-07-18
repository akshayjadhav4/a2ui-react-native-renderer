import { Component, type ReactNode } from "react";

import type { A2UIRendererError } from "./types.js";

interface A2UIErrorBoundaryProps {
  readonly children?: ReactNode;
  readonly resetKey: string | number;
  readonly createError: (cause: unknown) => A2UIRendererError;
  readonly reportError: (error: A2UIRendererError) => void;
  readonly renderFallback: (error: A2UIRendererError) => ReactNode;
}

interface A2UIErrorBoundaryState {
  readonly cause: Error | null;
  readonly error: A2UIRendererError | null;
  readonly resetKey: string | number;
}

export class A2UIErrorBoundary extends Component<
  A2UIErrorBoundaryProps,
  A2UIErrorBoundaryState
> {
  override state: A2UIErrorBoundaryState = {
    cause: null,
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(
    cause: Error,
  ): Partial<A2UIErrorBoundaryState> {
    return { cause };
  }

  static getDerivedStateFromProps(
    props: A2UIErrorBoundaryProps,
    state: A2UIErrorBoundaryState,
  ): Partial<A2UIErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) {
      return null;
    }

    return {
      cause: null,
      error: null,
      resetKey: props.resetKey,
    };
  }

  override componentDidCatch(cause: Error): void {
    const error = Object.freeze(this.props.createError(cause));
    this.setState({ error });
    this.props.reportError(error);
  }

  override render(): ReactNode {
    if (this.state.cause === null) {
      return this.props.children;
    }

    return this.state.error === null
      ? null
      : this.props.renderFallback(this.state.error);
  }
}
