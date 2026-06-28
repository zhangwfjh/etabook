import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="h-full grid place-items-center p-8">
          <div className="text-center space-y-4">
            <h2 className="text-lg font-semibold text-red-500">Something went wrong</h2>
            <pre className="text-xs text-muted-foreground max-w-md overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
            <button
              className="px-4 py-2 rounded border hover:bg-accent"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
