import { DecorateManager, DecorationStyle } from './decorate-manager'
import { Disposable, ExtensionContext, OutputChannel, TextDocument, TextEditor } from 'vscode'
import { Languages, Window, Workspace } from './wrapper/vscode'

import { DiagnosticManager } from './diagnostic-manager'
import { Filesystem } from './filesystem'
import { MessageCollection } from './message-collection'
import { Parser } from './parser'
import { Phpunit } from './phpunit'

export function activate(context: ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "vscode-phpunit" is now active!')

    const decorateManager = new DecorateManager(new DecorationStyle(context.extensionPath))
    context.subscriptions.push(new Runner(decorateManager).register())
}

// this method is called when your extension is deactivated
export function deactivate() {}

class Runner {
    private disposable: Disposable

    private messageCollection: MessageCollection = new MessageCollection()

    public constructor(
        private decorateManager: DecorateManager,
        private diagnosticManager: DiagnosticManager = new DiagnosticManager(new Languages()),
        private shell: Phpunit = new Phpunit(new Parser(), new Filesystem()),
        private workspace: Workspace = new Workspace(),
        private window: Window = new Window()
    ) {
        this.setupOutputChannel()
    }

    private setupOutputChannel() {
        const channel: OutputChannel = this.window.createOutputChannel('PHPUnit')
        this.shell.setRootPath(this.workspace.rootPath).setOutput((buffer: Buffer) => {
            channel.append(this.noAnsi(buffer.toString()))
        })
    }

    public register(): this {
        const subscriptions: Disposable[] = []

        // this.workspace.onDidOpenTextDocument(this.trigger(false), null, subscriptions)
        this.workspace.onWillSaveTextDocument(this.trigger(false), null, subscriptions)
        // this.workspace.onDidSaveTextDocument(this.trigger(false), null, subscriptions)
        // this.workspace.onDidChangeTextDocument(this.trigger(true), null, subscriptions)
        // this.window.onDidChangeActiveTextEditor(this.trigger(false), null, subscriptions)
        this.window.onDidChangeActiveTextEditor(
            () => this.restore(this.getActiveTextEditor()),
            null,
            subscriptions
        )

        this.restore(this.getActiveTextEditor())

        this.disposable = Disposable.from(...subscriptions)

        return this
    }

    public async handle(editor: TextEditor) {
        if (this.isRunable(editor) === false) {
            return
        }

        await this.getMessage(editor)

        this.handleDecorate(editor)
        this.handelDiagnostic(editor)
    }

    public restore(editor: TextEditor): void {
        if (this.isRunable(editor) === false) {
            return
        }

        if (this.messageCollection.has(editor.document.fileName)) {
            this.handleDecorate(editor)
            this.handelDiagnostic(editor)

            return
        }

        this.handle(editor)
    }

    public dispose() {
        this.messageCollection.dispose()
        this.diagnosticManager.dispose()
        this.disposable.dispose()
    }

    protected async getMessage(editor: TextEditor) {
        const messages = await this.shell.handle(editor.document.fileName)
        this.messageCollection.put(messages)
    }

    protected handleDecorate(editor: TextEditor) {
        this.decorateManager.handle(this.messageCollection, editor)
    }

    protected handelDiagnostic(editor: TextEditor) {
        this.diagnosticManager.handle(this.messageCollection, editor)
    }

    protected trigger(checkDocument: boolean = false) {
        if (checkDocument === true) {
            return (document: TextDocument) => {
                const editor = this.getActiveTextEditor()
                if (editor && document === editor.document) {
                    this.handle(editor)
                }
            }
        }

        return () => {
            this.handle(this.getActiveTextEditor())
        }
    }

    protected isRunable(editor: TextEditor) {
        const keywords = new RegExp(
            [
                'PHPUnit\\\\Framework\\\\TestCase',
                'PHPUnit\\Framework\\TestCase',
                'PHPUnit_Framework_TestCase',
                'TestCase',
            ].join('|')
        )

        if (!editor || !editor.document || keywords.test(editor.document.getText()) === false) {
            return false
        }

        if (/\.git\.php$/.test(editor.document.fileName) === true) {
            return false;
          }

        return true
    }

    protected noAnsi(str: string): string {
        return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
    }

    protected getActiveTextEditor(): TextEditor {
        return this.window.getActiveTextEditor()
    }
}
