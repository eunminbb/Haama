// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as marked from 'marked';
import * as fs from 'fs';
// 
import { getProviderErrorMsg,providerFromModel } from './utils';

import { ChatCompletionRequestMessage } from "openai";

import { APIProvider } from "./apiProvider";
import { OllamaParams, ollamaLLMProvider } from './ollama';

interface ResourcePaths {
    htmlPath: string;
    haamaJsPath: string;
    haamaCssPath: string;
    iconPath: string;
    highlightJsCssPath: string;
    highlightJsScriptPath: string;
}

interface Preferences {
    pressEnterToSend: false;
};

console.log("Node.js version:", process.version);

const isMac = process.platform === "darwin";

const OS_LOCALIZED_KEY_CHORD = isMac ? "Cmd+Shift+P" : "Ctrl+Shift+P";
const NO_SELECTION_COPY = "No code is highlighted. Highlight code to include it in the message to OLLAMA.";
const SELECTION_AWARENESS_OFF_COPY = `Code selection awareness is turned off. To turn it on, go to settings (${OS_LOCALIZED_KEY_CHORD}).`;

let apiProvider: APIProvider | undefined;
let messages: ChatCompletionRequestMessage[] = [];

let selectedCode: string;
let selectedCodeSentToGpt: string;

let highlightedCodeAwareness: boolean = vscode.workspace.getConfiguration('haama').get('highlightedCodeAwareness') || false;

let pressEnterToSend: boolean = vscode.workspace.getConfiguration('haama').get('pressEnterToSend') || false;

function gatherPreferences(): Preferences {
    const pressEnterToSend = vscode.workspace.getConfiguration('haama').get('pressEnterToSend') || false;
    return {
        pressEnterToSend
    } as Preferences;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    console.log("activate haama");
    
    context.subscriptions.push(
        vscode.commands.registerCommand('haama.openSettings', openSettings)
    );



    // const secretStorage = context.secrets;
    // const secretChangeListener = secretStorage.onDidChange(async (e: vscode.SecretStorageChangeEvent) => {
    //     const forceReinit = true;
      
    //     if (e.key === "haama.anthropicApiKey") {
    //         const key = await context.secrets.get("haama.anthropicApiKey");
    //         if (!key) {
    //             return;
    //         }
    //         // Reinitialize the API provider if the Anthropic API key changes
    //         await initApiProviderIfNeeded(context, forceReinit);
    //     } else if (e.key === "haama.openAiApiKey") {
    //         const key = await context.secrets.get("haama.openAiApiKey");
    //         if (!key) {
    //             return;
    //         }
    //         // Reinitialize the API provider if the OpenAI API key changes
    //         await initApiProviderIfNeeded(context, forceReinit);
    //     }
    // });
  
    // context.subscriptions.push(secretChangeListener);

    let disposable = vscode.commands.registerCommand('haama.start', async () => {
        const haamaPanel = vscode.window.createWebviewPanel(
            'haama',
            'HaaMa',
            vscode.ViewColumn.Beside,
            {
                // allow the extension to reach files in the bundle
                localResourceRoots: [vscode.Uri.file(path.join(__dirname, '..'))],
                enableScripts: true,
                // Retain the contsßext when the webview becomes hidden
                retainContextWhenHidden: true,
            },
        );

        //  ---------------  웹뷰 Path : html, js, css  -----------
        const htmlPathUri = vscode.Uri.file(path.join(context.extensionPath, 'src' ,'haama.html'));
        const htmlPath = htmlPathUri.with({scheme: 'vscode-resource'});   
        
        let jsPathUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "haama.js")));
        const jsPath = haamaPanel.webview.asWebviewUri(jsPathUri).toString();
        
        let cssUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "haama.css")));
        const cssPath = haamaPanel.webview.asWebviewUri(cssUri).toString();
        
        let highlightJsCssUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "atom-one-dark.min.css")));
        const highlightJsCssPath = haamaPanel.webview.asWebviewUri(highlightJsCssUri).toString();
        
        let highlightJsScriptUri = vscode.Uri.file(context.asAbsolutePath(path.join('src', "highlight.min.js")));
        const highlightJsScriptPath = haamaPanel.webview.asWebviewUri(highlightJsScriptUri).toString();
        
        let iconUri = vscode.Uri.file(context.asAbsolutePath(path.join('assets', "hana2.png")));
        const iconPath = haamaPanel.webview.asWebviewUri(iconUri).toString();
        
        //  -------------------------------------------------------


        const model = vscode.workspace.getConfiguration('haama').get('model') || "No model configured";
        const provider = providerFromModel(model.toString());
        // provider == "ollama"

        
        const errorCallback = (error: any) => {
            console.error('Error fetching stream:', error);
            const errorMessage = error.message;
            const humanRedableError = getProviderErrorMsg(provider.toString(), errorMessage);
            haamaPanel.webview.postMessage({ command: "ollamaError", error: humanRedableError });
        };
        
        const configDetails = model.toString();
        
        const resourcePaths = {
            htmlPath: htmlPath.fsPath,
            haamaJsPath: jsPath.toString(),
            haamaCssPath: cssPath.toString(),
            iconPath: iconPath.toString(),
            highlightJsCssPath: highlightJsCssPath,
            highlightJsScriptPath: highlightJsScriptPath,
        };

        haamaPanel.webview.html = getWebviewContent(resourcePaths, configDetails);

        const preferences = gatherPreferences();
        console.log("preferences", preferences);
        haamaPanel.webview.postMessage({
            command: 'updatePreferences',
            preferences
        });
          
        resetChat();

        haamaPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                case "getLlamaResponse":
                    // Turn the user's message to Markdown and echo it back
                    const userMessageMarkdown = marked.marked(message.userMessage);
                    haamaPanel.webview.postMessage({ command: "sentUserMessage", userMessageMarkdown });
                    
                    // Proceed to query API and stream back the generated chunks.
                    await initApiProviderIfNeeded(context);

                    await getLlamaResponse(
                        message.userMessage,
                        (chunk) => {
                            haamaPanel.webview.postMessage({ command: "getLlamaResponse", chunk });
                        },
                        errorCallback
                    );
                    return;
                case "resetChat":
                    resetChat();
                    haamaPanel.webview.postMessage({ command: "resetChatComplete" });
                    return;
                case "exportChat":
                    await exportChat();
                    return;
                case "importChat":
                    const success = await importChat();
                    if (success) {
                        haamaPanel.webview.postMessage({ command: "loadChatComplete", messages });
                    } else {    
                        console.error("Failed to import chat");
                    }
                    return;
                case "navigateToHighlightedCode":
                    navigateToHighlightedCode();
                    return;
                case "insertCode": // used for drag and drop
                    const activeEditor = vscode.window.activeTextEditor;
                    if (activeEditor) {
                        const position = activeEditor.selection.active;
                        activeEditor.edit((editBuilder) => {
                            editBuilder.insert(position, message.code);
                        });
                    }
                    return;
                case "openSettings":
                    vscode.commands.executeCommand('workbench.action.openSettings', 'haama');
                    break;
                }

            },
            null,
            context.subscriptions
        );

        // Add an event listener for selection changes
        context.subscriptions.push(
            vscode.window.onDidChangeTextEditorSelection((event) => handleSelectionChange(event, haamaPanel))
        );

        // listen for changes in highlightedCodeAwareness
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('haama.highlightedCodeAwareness')) {
                highlightedCodeAwareness = vscode.workspace.getConfiguration('haama').get('highlightedCodeAwareness') || false;
                
                // This is imperfect because if there's code selected while the setting is changed
                // the status copy will be 'wrong'. 
                haamaPanel.webview.postMessage({
                    command: 'updateHighlightedCodeStatus',
                    status: !highlightedCodeAwareness ? SELECTION_AWARENESS_OFF_COPY : NO_SELECTION_COPY,
                    showButton: false
                });
            }
            if (e.affectsConfiguration('haama.pressEnterToSend')) {
                console.log(`pressEnterToSend changed to ${vscode.workspace.getConfiguration('haama').get('pressEnterToSend')}`);
                pressEnterToSend = vscode.workspace.getConfiguration('haama').get('pressEnterToSend') || false;
                haamaPanel.webview.postMessage({
                    command: 'updatePreferences',
                    preferences: gatherPreferences(),
                });
            }

            if (e.affectsConfiguration('haama.model')) {
                initApiProviderIfNeeded(context, true);
                haamaPanel.webview.postMessage({
                    command: 'updateModelConfigDetails',
                    modelConfigDetails: vscode.workspace.getConfiguration('haama').get('model')!,
                });
            }
        });
        
        haamaPanel.onDidDispose(
            () => {
                console.log('WebView closed');
            },
            null,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

function openSettings() {
    vscode.commands.executeCommand('workbench.action.openSettings', 'haama');
}

function getWebviewContent(
    paths: ResourcePaths,
    modelConfigDetails: string) {
    const codeHighlightStatusCopy = !highlightedCodeAwareness ? SELECTION_AWARENESS_OFF_COPY : NO_SELECTION_COPY;

    console.log(`Loading webview content from ${paths.htmlPath}`);

    const html = fs.readFileSync(paths.htmlPath, 'utf8');
    const variables = { 
        paths,
        modelConfigDetails,
        codeHighlightStatusCopy
    };

    const webviewHtml = (new Function("variables", `with (variables) { return \`${html}\`; }`))(variables);

    return webviewHtml;
}

function resetChat() {
    console.log("Resetting chat");
    // Load the sytem prompt and clear the chat history.
    let systemPrompt: any = vscode.workspace.getConfiguration('haama').get('systemPrompt');
    if (!systemPrompt) {
        vscode.window.showErrorMessage('No system prompt found in the haama settings. Please add your system prompt using the "Open haama Settings" command and restart the extension.');
        return;
    }

    messages = [];
    messages.push({"role": "system", "content": systemPrompt.toString()});
}

async function getLlamaResponse(userMessage: string, completionCallback: (completion: string) => void ,errorCallback?: (error: any) => void) {
    if (!apiProvider) {
        throw new Error("API provider is not initialized.");
    }
    
    if (highlightedCodeAwareness && selectedCodeSentToGpt !== selectedCode) {
        console.log("Including highlighted text in API request.");
        userMessage = `${prepareSelectedCodeContext()} ${userMessage}`;
        selectedCodeSentToGpt = selectedCode;
    } else {
        console.log("Not including highlighted text in API request because it's already been sent");
    }
  
    messages.push({ role: "user", content: userMessage });
  
    const maxTokens = vscode.workspace.getConfiguration("haama").get("maxLength");
    const model = vscode.workspace.getConfiguration("haama").get("model")!;
    let provider = providerFromModel(model.toString());
    const temperature = vscode.workspace.getConfiguration("haama").get("temperature");
  
    if (!maxTokens) {
        vscode.window.showErrorMessage(
            'Missing maxLength in the haama settings. Please add them using the "Open haama Settings" command and restart the extension.'
        );
        return;
    }

    let params: OllamaParams;

    // if (provider === "openai" || provider === "custom") {
    //     params = {
    //         model: model.toString(),
    //         messages: messages,
    //         // eslint-disable-next-line @typescript-eslint/naming-convention
    //         max_tokens: Number(maxTokens),
    //         temperature: Number(temperature),
    //         stream: true,
    //     };
    // } else if (provider === "anthropic") {
    //     params = {
    //         prompt: convertOpenAIMessagesToAnthropicMessages(messages),
    //         // eslint-disable-next-line @typescript-eslint/naming-convention
    //         max_tokens: Number(maxTokens),
    //         model: model.toString(),
    //     };
    // } 
    console.log("프로바이더 === ", provider)
    if (provider === "ollama") {
        console.log("ollama 메세지", messages)
        params = {
            prompts: messages,
            model: model.toString(),
            temperature: Number(temperature),
        };   
    }
    else {
        vscode.window.showErrorMessage(
            'Unsupported AI provider in the haama settings. Please add it using the "Open haama Settings" command and restart the extension.'
        );
        return;
    }
  
    try {
        await apiProvider.completeStream(
            params,
            {
                onUpdate: (completion: string) => {
                    if (completion) {
                        completionCallback(marked.marked(completion ?? "<no completion>"));
                    }
                },
                onComplete: (message: string) => {
                    messages.push({"role": "assistant", "content":  marked.marked(message ?? "<no message>")});
                }
            }
        );
    } catch (error: any) {
        if (errorCallback) {
            errorCallback(error);
        }
    }
}

async function exportChat() {
    const options: vscode.SaveDialogOptions = {
        defaultUri: vscode.Uri.file('haama-history-'),
        filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'JSON': ['json']
        }
    };

    const fileUri = await vscode.window.showSaveDialog(options);
    if (fileUri) {
        const content = JSON.stringify(messages, null, 2);
        fs.writeFile(fileUri.fsPath, content, (err) => {
            if (err) {
                vscode.window.showErrorMessage('Failed to export messages: ' + err.message);
            } else {
                vscode.window.showInformationMessage('Messages exported successfully!');
            }
        });
    }
}

// Import chat history from a JSON file
async function importChat() {
    const options: vscode.OpenDialogOptions = {
        canSelectMany: false,
        filters: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Chat History': ['json']
        }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
        try {
            const data = await fs.promises.readFile(fileUri[0].fsPath, 'utf8');
            const importedMessages = JSON.parse(data);

            messages = importedMessages.map((message: any) => {
                return {
                    "role": message.role,
                    "content": marked.marked(message.content)
                };
            });
            vscode.window.showInformationMessage('Messages imported successfully!');
            return true;
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                vscode.window.showErrorMessage('Failed to import messages: ' + e.message);
            } else {
                vscode.window.showErrorMessage('Failed to parse JSON: ' + e.message);
            }
        }
    }

    return false;
}

async function initApiProviderIfNeeded(context: vscode.ExtensionContext, force: boolean = false) {
    console.log("Initializing API provider...");
    if (apiProvider !== undefined && !force) {
        console.log("API provider already initialized.");
        return;
    }
  
    const model = vscode.workspace.getConfiguration("haama").get("model")!;
    const providerType = providerFromModel(model.toString());
    if (!providerType) {
        vscode.window.showErrorMessage(
            'No provider found in the haama settings. Please add your provider using the "Open haama Settings" command and restart the extension.'
        );
        return;
    }
  
    // if (providerType === "anthropic") {
    //     console.log("Initializing Anthropic provider...");
    //     apiProvider = new AnthropicProvider(context);
    // } else if (providerType === "openai") {
    //     console.log("Initializing OpenAI provider...");
    //     apiProvider = new OpenAIProvider(context);
    // } 
    // else if (providerType === "custom") {
    //     console.log("Initializing custom provider...");
    //     apiProvider = new CustomLLMProvider(context, customServerUrl);
    // } 


    if (providerType === "ollama") {
        console.log("Initializing ollama provider...");
        apiProvider = new ollamaLLMProvider(context);
        
    } else {
        vscode.window.showErrorMessage(
            `Invalid provider "${providerType}" in the haama settings. Please use a valid provider and restart the extension.`
        );
        return;
    }
  
    try {
        console.log("Calling init()");
        await apiProvider.init();
        console.log("init() returned.");
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error initializing provider: ${error.message}`);
    }
}

function navigateToHighlightedCode() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const selection = editor.selection;
    if (!selection.isEmpty) {
        editor.revealRange(selection, vscode.TextEditorRevealType.Default);
    }
}

function getTokenEstimateString(numCharacters: number): string {
    const estimate = Math.round(numCharacters / 4);
    if (estimate === 1) {
        return `~${estimate} token`;
    }
    return `~${estimate} tokens`;
}

function handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent, haamaPanel: vscode.WebviewPanel) {
    selectedCode = event.textEditor.document.getText(event.selections[0]);
    if (selectedCode && highlightedCodeAwareness) {
        const numCharacters = selectedCode.length;
        haamaPanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: `${numCharacters} characters (${getTokenEstimateString(numCharacters)}) are highlighted. This code will be included in your message to the assistant.`,
            showButton: true
        });
    } else if (!highlightedCodeAwareness) {
        haamaPanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: SELECTION_AWARENESS_OFF_COPY,
            showButton: false
        });
    } else {
        haamaPanel.webview.postMessage({
            command: 'updateHighlightedCodeStatus',
            status: NO_SELECTION_COPY,
            showButton: false
        });
    }
}

function prepareSelectedCodeContext() {
    return `
    CONTEXT:
    =========================
    In my question I am referring to the following code:
    ${selectedCode}
    =========================\n`;
}

// This method is called when your extension is deactivated
export function deactivate() {
    console.log("deactivate Haama");
}
