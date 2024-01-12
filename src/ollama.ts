// import * as vscode from "vscode";
// import { APIProvider } from "./apiProvider";
// import { Ollama } from "langchain/llms/ollama";
// import { PromptTemplate } from "langchain/prompts";
// import { LLMChain } from "langchain/chains";
// import { BufferMemory } from "langchain/memory";
// import { ConversationChain } from "langchain/chains";
// import { ChatOllama } from "langchain/chat_models/ollama";

// export interface OllamaParams {
//     model: string;
//     prompts:any[];
//     // max_tokens: number;
//     temperature: number;
//     // stream: boolean;
// }

// export class ollamaLLMProvider extends APIProvider {
//     private ollama: Ollama | undefined;
//     private context: vscode.ExtensionContext;
//     private baseUrl: string | undefined;
//     private chain: ConversationChain|undefined;

    
//     constructor(context: vscode.ExtensionContext) {
//         super();
//         this.context = context;
//         console.log(`ollama initialized!!`);
//     }
    
//     async init() {
//         this.baseUrl = "http://localhost:11434"
//         const model = vscode.workspace.getConfiguration("haama").get("model")!;
//         const temperature = vscode.workspace.getConfiguration("haama").get("temperature");
//         this.ollama = new Ollama({
//             baseUrl: this.baseUrl, // Default value
//             model:  model.toString(),
//             verbose:true,
//             temperature: Number(temperature),
            
//         }); 
//         // const chain = new LLMChain({ llm: this.ollama, prompt });
//         const memory = new BufferMemory();
//         this.chain = new ConversationChain({ llm: this.ollama, memory: memory});

//     }
    
//     async completeStream(params: OllamaParams , callbacks: any) {
//         const initialRecentPrompt = params.prompts[params.prompts.length-1]["content"];
//         // const codellamaInitialRecentPrompt = "Give me only code block with triple backticks. " + initialRecentPrompt;

//         // const customPrompts = params.model.startsWith("codellama") ? codellamaInitialRecentPrompt : initialRecentPrompt;
//         const prompt = PromptTemplate.fromTemplate(
//             // customPrompts
//             initialRecentPrompt
//           );
        
        
        

//         if (!this.baseUrl||!this.chain) {
//             throw new Error("ollama API is not initialized.");
//         }

//         try {

//             // const stream = await this.ollama.stream(
//             const stream = await this.chain?.stream(
//                 initialRecentPrompt
//                 // customPrompts
//             );
//             console.log(stream)
//             // for await (const chunk of stream) {
//             //     console.log("답변 청크: ", chunk)
                
//             // }
                
//                 // let buffer = "";
//                 // let gptMessage = "";
                
//                 // for await (const chunk of stream) {
//                 //     console.log(chunk)
//                 //     try {
//                 //         if (chunk) {
//                 //             gptMessage += chunk;
//                 //             if (callbacks.onUpdate) {
//                 //                 callbacks.onUpdate(gptMessage);
//                 //             }
//                 //         }
//                 //     } catch (error) {
//                 //         console.error("Error parsing message:", error);
//                 //         continue;
//                 //     }
//                 // }

//                 // callbacks.onComplete(gptMessage);
                
                                    
//         } catch (error: any) {
//             console.error("Error fetching stream:", error);
//             throw error;
//         }
//     }
// }





import * as vscode from "vscode";
import { APIProvider } from "./apiProvider";
import { Ollama } from "langchain/llms/ollama";


export interface OllamaParams {
    model: string;
    prompts:any[];
    // max_tokens: number;
    temperature: number;
    // stream: boolean;
}

export class ollamaLLMProvider extends APIProvider {
    private ollama: Ollama | undefined;
    private context: vscode.ExtensionContext;
    private baseUrl: string | undefined;
  
    constructor(context: vscode.ExtensionContext) {
        super();
        this.context = context;
        console.log(`ollama initialized!!`);
    }
  
    async init() {
        this.baseUrl = "http://localhost:11434"

    }
    
    async completeStream(params: OllamaParams , callbacks: any) {
        const initialRecentPrompt = params.prompts[params.prompts.length-1]["content"];
        // const codellamaInitialRecentPrompt = "Give me only code block about subsequent requests with triple backticks. " + initialRecentPrompt;

        // const customPrompts = params.model === "codellama" ? codellamaInitialRecentPrompt : initialRecentPrompt;
        this.ollama = new Ollama({
            baseUrl: this.baseUrl, // Default value
            model: params.model, 
            verbose:true,
            temperature: params.temperature
        });


        if (!this.baseUrl) {
            throw new Error("ollama API is not initialized.");
        }

        try {

            const stream = await this.ollama.stream(
                // customPrompts
                initialRecentPrompt
            );
                
                let gptMessage = "";
                
                for await (const chunk of stream) {
                    
                    try {
                        if (chunk) {
                            gptMessage += chunk;
                            if (callbacks.onUpdate) {
                                callbacks.onUpdate(gptMessage);
                            }
                        }
                    } catch (error) {
                        console.error("Error parsing message:", error);
                        continue;
                    }
                }

                callbacks.onComplete(gptMessage);
                
                                    
        } catch (error: any) {
            console.error("Error fetching stream:", error);
            throw error;
        }
    }
}