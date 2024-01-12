import * as vscode from 'vscode';

const supportedProviders = "ollama";

export function getProviderErrorMsg(provider: string, error: any) {
    const model = vscode.workspace.getConfiguration('haama').get('model') || "No model configured";

    if (provider === "ollama") {
        return `
            <b>You're hitting an Ollama error.</b><br><br>
            <b>Error message</b>: <i>'${error}'</i>.<br><br>
        `;
    } 

    return `Error: ${error}`;
} 

// export async function promptForApiKey(provider: string, context: vscode.ExtensionContext) {
//     if (supportedProviders !== provider.toLowerCase()) {
//         vscode.window.showErrorMessage(`Invalid provider "${provider}" in the Haama settings. Please use a valid provider and restart the extension.`);
//         return;
//     }

//     let providerCleanName = provider.charAt(0).toUpperCase() + provider.slice(1);
    
//     const apiKey = await vscode.window.showInputBox({
//         prompt: `Enter your ${providerCleanName} API key to use haama. Your API key will be stored in VS Code\'s SecretStorage.`,
//         ignoreFocusOut: true,
//         password: true,
//     });

//     const secretStorageKey = `haama.${provider}ApiKey`;

//     if (apiKey) {
//         await context.secrets.store(secretStorageKey, apiKey);
//         vscode.window.showInformationMessage(`API key stored successfully (under '${secretStorageKey}').`);
//     } else {
//         vscode.window.showErrorMessage('No API key entered. Please enter your API key to use haama.');
//     }
// }

export function providerFromModel(model: string) {

    if (model === "codellama"|| "llama2"|| "codellama:34b") {
        console.log("provider == ollama")
        return "ollama";
    }
    return "";
}
