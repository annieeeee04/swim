package com.annie.swim.agent.llm;

import com.annie.swim.agent.AgentProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link LlmClient} backed by the Anthropic Messages API. Uses the JDK
 * HttpClient — no extra dependencies. Fails fast with a clear message when
 * no API key is configured (the feature flag should be off in that case).
 */
@Service
public class ClaudeLlmClient implements LlmClient {

    private static final String API_URL = "https://api.anthropic.com/v1/messages";
    private static final String API_VERSION = "2023-06-01";

    private final AgentProperties props;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public ClaudeLlmClient(AgentProperties props) {
        this.props = props;
    }

    @Override
    public LlmResponse complete(String system, List<Map<String, Object>> messages, List<Map<String, Object>> tools) {
        if (props.getAnthropicApiKey() == null || props.getAnthropicApiKey().isBlank()) {
            throw new IllegalStateException(
                    "No Anthropic API key configured (app.agent.anthropic-api-key). "
                            + "Set the key or disable the agent (app.agent.enabled=false).");
        }
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", props.getModel());
            body.put("max_tokens", props.getMaxTokens());
            body.put("system", system);
            body.put("messages", messages);
            if (tools != null && !tools.isEmpty()) {
                body.put("tools", tools);
            }

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(API_URL))
                    .timeout(Duration.ofSeconds(60))
                    .header("content-type", "application/json")
                    .header("x-api-key", props.getAnthropicApiKey())
                    .header("anthropic-version", API_VERSION)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new RuntimeException("Anthropic API returned HTTP " + response.statusCode()
                        + ": " + truncate(response.body()));
            }
            return parse(mapper.readTree(response.body()));
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("LLM call failed: " + e.getMessage(), e);
        }
    }

    private LlmResponse parse(JsonNode root) {
        StringBuilder text = new StringBuilder();
        List<LlmResponse.ToolCall> toolCalls = new ArrayList<>();
        List<Map<String, Object>> rawContent = new ArrayList<>();

        for (JsonNode block : root.path("content")) {
            String type = block.path("type").asText();
            if ("text".equals(type)) {
                text.append(block.path("text").asText());
                rawContent.add(Map.of("type", "text", "text", block.path("text").asText()));
            } else if ("tool_use".equals(type)) {
                toolCalls.add(new LlmResponse.ToolCall(
                        block.path("id").asText(),
                        block.path("name").asText(),
                        block.path("input")));
                rawContent.add(Map.of(
                        "type", "tool_use",
                        "id", block.path("id").asText(),
                        "name", block.path("name").asText(),
                        "input", mapper.convertValue(block.path("input"), Map.class)));
            }
        }
        return new LlmResponse(text.toString(), toolCalls, root.path("stop_reason").asText(), rawContent);
    }

    private static String truncate(String s) {
        return s == null ? "" : (s.length() > 500 ? s.substring(0, 500) + "…" : s);
    }
}
