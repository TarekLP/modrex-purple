import { Component, type ReactNode } from 'react'
import { error as logError } from '@tauri-apps/plugin-log'

interface Props {
    children: ReactNode
}

interface State {
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null }

    static getDerivedStateFromError(error: Error): State {
        return { error }
    }

    componentDidCatch(error: Error, info: { componentStack: string }) {
        logError(`React error: ${error.message}\n${info.componentStack}`)
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex flex-col items-center justify-center h-screen gap-4 text-text-subtle">
                    <p className="text-sm">Something went wrong.</p>
                    <pre className="text-xs max-w-lg overflow-auto text-danger-text">
                        {this.state.error.message}
                    </pre>
                </div>
            )
        }
        return this.props.children
    }
}
