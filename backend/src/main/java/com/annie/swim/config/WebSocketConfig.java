package com.annie.swim.config;

import com.annie.swim.service.PushService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/** Registers the real-time push channel, restricted to the same origins as the REST API. */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final PushService pushService;
    private final String[] allowedOrigins;

    public WebSocketConfig(
            PushService pushService,
            @Value("${app.cors.allowed-origins:http://localhost:5173}") String allowedOrigins) {
        this.pushService = pushService;
        this.allowedOrigins = allowedOrigins.split(",");
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(pushService, "/ws").setAllowedOrigins(allowedOrigins);
    }
}
