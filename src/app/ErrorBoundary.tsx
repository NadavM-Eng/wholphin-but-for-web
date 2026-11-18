import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorScreen } from './ErrorScreen'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Last-resort boundary around the whole app (React error boundaries must be classes). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    return this.state.error ? <ErrorScreen error={this.state.error} /> : this.props.children
  }
}
