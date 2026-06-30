# Unified LLM Management — Provider Onboarding, Consumer Authorization & Call Verification

Demonstrates unified LLM provider management, covering the complete workflow from adding providers, creating consumers, authorization, to call verification.

Modules involved: LLM Management (Provider Management), Consumers

__Demo duration__: ~5 minutes

## Scenario Overview

The AI Gateway (LLM Gateway) supports unified proxy access for mainstream LLM providers including OpenAI, DeepSeek, Llama, OpenRouter, Qwen, and Volcengine. It provides a standardized calling interface compatible with the OpenAI API protocol, enabling centralized multi-model management and control.

This scenario demonstrates how to onboard an LLM provider to the platform, create a consumer, grant authorization, and verify the call chain.

## Prerequisites

Log in as System Administrator> **Note:** Project names, API paths, consumer names, MCP service names, etc. in this document are example values. If you encounter a "name already exists" or "path already exists" error when saving or publishing, it means the resource already exists in the current environment. Simply replace it with any name or path that does not exist in the system — this will not affect the subsequent operation flow.

## Steps

### Step 1: Add an LLM Provider

1. Navigate to [LLM Management] -> [Provider Management], click [+ Add Provider]
2. Configure the provider type (e.g., DeepSeek), name, and API Key
3. Click [OK]
	- Expected: "Created successfully" prompt appears, provider card is shown in the list

![](https://empower.paraview.cn/api/open/file/get/v69ab0aef5ed65859a57529571f7ca97a6b1ea33656aa128def3629881b8247204)

Add LLM Provider

![](https://empower.paraview.cn/api/open/file/get/v66a6bc5b3f5f0c9c7590111fa19bb20b8c8023197999ed22e95a2eb2d6e0ea922)

Provider List

### Step 2: Create a Consumer

1. Navigate to [Portal] -> [Consumers] -> [+ Add]
2. Application name: LLM Test Consumer, Authentication method: Key\-Auth
3. Click [OK]
	- Expected: Created successfully, the page displays AppId and ApiKey — record them for later use

![](https://empower.paraview.cn/api/open/file/get/v6d00282ed6ebc27f1ddb5616c47521c98fed76ebf4336352614f9ad16e191239c)

Create Consumer

![](https://empower.paraview.cn/api/open/file/get/v62843bfd921304d7ac7831608fe52fa45ec5791fd87d2cacb514338576711cfd6)

Consumer List

### Step 3: Configure a Routing Strategy

1. In [LLM Management], switch to the Routing Strategy tab
2. Click [Add Strategy], configure the strategy name, routing mode (e.g., Single), and routing target (select the provider and model just added)
3. Click [OK]
	- Expected: "Created successfully" prompt appears, a new routing strategy is added to the list

![](https://empower.paraview.cn/api/open/file/get/v6a391ea5d51fd4ff57c908c6fe80f872a2a1362a4b2fec90a203bf25837279653)

Create Routing Strategy

![](https://empower.paraview.cn/api/open/file/get/v6157d71b1cec49bbe2feef28f1d919ced223311ead26150a29c5817425b607ba6)

Routing Strategy List

### Step 4: Authorize the Consumer

1. In the consumer list, find "LLM Test Consumer" and click [Routing Strategy Authorization] in the action column
2. Select deployment environment c1, select the routing strategy to authorize, click [Confirm Authorization]
	- Expected: "Authorization successful" prompt appears

![](https://empower.paraview.cn/api/open/file/get/v678e223701912ce24e95ea26197f7da94acb03b3b8a38beac1b157dfda5fe1ace)

![](https://empower.paraview.cn/api/open/file/get/v6557531414236ffcfb1b0796cdbc10e851aa06b945960e22ab8a27bd45640799c)

Routing Strategy Authorization

3. Copy the LLM access URL for subsequent calls

### Step 5: Verify the Call

Execute in terminal:

curl \-X POST "http://{actual-LLM-access-URL}" \\
  \-H "Content\-Type: application/json" \\
  \-H "apikey: {actual-ApiKey}" \\
  \-d '\{"model":"deepseek\-chat","messages":\[\{"role":"user","content":"Hello"\}\],"stream":false\}'

Expected: Returns HTTP 200, AI model responds normally

### Step 6: View LLM Logs

1. Click the left menu [Audit Logging] -> [LLM Log]
2. Filter by consumer, log type, sequence number, response code, request/response content, time range, etc.
3. The list displays each call record: provider, consumer, interface name, sequence number, service latency, response code, request time, deployment environment
4. Click [View Details] in the action column to view the full request and response content

![](https://empower.paraview.cn/api/open/file/get/v6bd77225c8da76fc760f7ce402517b4ab7ecf02a58571d10354585c931b595cad)

LLM Log List

__Demo script__: One unified access URL for all LLM calls, centralized key management with no leakage, on-demand consumer authorization, and fully auditable call logs.
