package com.annie.swim.controller;

import com.annie.swim.model.User;
import com.annie.swim.service.AuthService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.view.RedirectView;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Third-party login (Google / Facebook).
 *
 * The full OAuth dance is wired here: the frontend asks for an authorize URL,
 * sends the user to the provider, the provider redirects back to
 * {@code /api/auth/oauth/{provider}/callback?code=...}, and we exchange the
 * code for a profile and mint our own app token.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Setup (needs real credentials):
 *   1. Register an app with each provider and obtain client id + secret.
 *   2. Add the redirect URI {scheme}://{host}/api/auth/oauth/{provider}/callback
 *      to the provider's allowed redirect list.
 *   3. Fill these in application.properties (or env vars):
 *        app.oauth.google.client-id / client-secret
 *        app.oauth.facebook.client-id / client-secret
 *        app.oauth.redirect-base   (public base URL of THIS backend)
 *        app.oauth.frontend-success (SPA URL to land on, e.g. http://localhost:5173)
 * ───────────────────────────────────────────────────────────────────────────
 */
@RestController
@RequestMapping("/api/auth/oauth")
public class OAuthController {

    private final AuthService auth;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();

    @Value("${app.oauth.google.client-id:}")
    private String googleClientId;
    @Value("${app.oauth.google.client-secret:}")
    private String googleClientSecret;

    @Value("${app.oauth.facebook.client-id:}")
    private String facebookClientId;
    @Value("${app.oauth.facebook.client-secret:}")
    private String facebookClientSecret;

    @Value("${app.oauth.redirect-base:http://localhost:8080}")
    private String redirectBase;
    @Value("${app.oauth.frontend-success:http://localhost:5173}")
    private String frontendSuccess;

    public OAuthController(AuthService auth) {
        this.auth = auth;
    }

    /** Step 1: the SPA fetches this to learn where to send the user. */
    @GetMapping("/{provider}/url")
    public AuthorizeUrl authorizeUrl(@PathVariable String provider) {
        String redirectUri = redirectBase + "/api/auth/oauth/" + provider + "/callback";
        String state = UUID.randomUUID().toString();
        switch (provider.toLowerCase()) {
            case "google" -> {
                requireConfigured(googleClientId, "google");
                String url = "https://accounts.google.com/o/oauth2/v2/auth"
                        + "?client_id=" + enc(googleClientId)
                        + "&redirect_uri=" + enc(redirectUri)
                        + "&response_type=code"
                        + "&scope=" + enc("openid email profile")
                        + "&state=" + enc(state);
                return new AuthorizeUrl(url, state);
            }
            case "facebook" -> {
                requireConfigured(facebookClientId, "facebook");
                String url = "https://www.facebook.com/v18.0/dialog/oauth"
                        + "?client_id=" + enc(facebookClientId)
                        + "&redirect_uri=" + enc(redirectUri)
                        + "&response_type=code"
                        + "&scope=" + enc("email,public_profile")
                        + "&state=" + enc(state);
                return new AuthorizeUrl(url, state);
            }
            default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "unknown provider: " + provider);
        }
    }

    /** Step 2: provider redirects here with ?code=... We mint our token and
     *  bounce back to the SPA at {frontend-success}#token=... */
    @GetMapping("/{provider}/callback")
    public RedirectView callback(
            @PathVariable String provider,
            @RequestParam(required = false) String code,
            @RequestParam(required = false) String error) {
        if (error != null) {
            return new RedirectView(frontendSuccess + "#oauth_error=" + enc(error));
        }
        if (code == null || code.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "missing authorization code");
        }
        String redirectUri = redirectBase + "/api/auth/oauth/" + provider + "/callback";
        try {
            User user = switch (provider.toLowerCase()) {
                case "google" -> handleGoogle(code, redirectUri);
                case "facebook" -> handleFacebook(code, redirectUri);
                default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND, "unknown provider: " + provider);
            };
            String token = auth.issueToken(user);
            // Hash fragment keeps the token out of server logs / Referer headers.
            return new RedirectView(frontendSuccess + "#token=" + enc(token));
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            return new RedirectView(frontendSuccess + "#oauth_error=" + enc("exchange_failed"));
        }
    }

    // ---------- provider-specific exchanges ----------

    private User handleGoogle(String code, String redirectUri) throws Exception {
        String form = "code=" + enc(code)
                + "&client_id=" + enc(googleClientId)
                + "&client_secret=" + enc(googleClientSecret) // TODO: must be set
                + "&redirect_uri=" + enc(redirectUri)
                + "&grant_type=authorization_code";
        JsonNode tokenJson = postForm("https://oauth2.googleapis.com/token", form);
        String accessToken = tokenJson.path("access_token").asText(null);
        if (accessToken == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "google token exchange failed");
        }
        JsonNode profile = getJson("https://openidconnect.googleapis.com/v1/userinfo", accessToken);
        String sub = profile.path("sub").asText(null);
        String email = profile.path("email").asText(null);
        String name = profile.path("name").asText(email);
        return auth.findOrCreateOAuthUser(User.Provider.GOOGLE, sub, email, name);
    }

    private User handleFacebook(String code, String redirectUri) throws Exception {
        String form = "client_id=" + enc(facebookClientId)
                + "&client_secret=" + enc(facebookClientSecret)
                + "&grant_type=authorization_code"
                + "&redirect_uri=" + enc(redirectUri)
                + "&code=" + enc(code);
        JsonNode tokenJson = postForm("https://graph.facebook.com/v18.0/oauth/access_token", form);
        String accessToken = tokenJson.path("access_token").asText(null);
        if (accessToken == null) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "facebook token exchange failed");
        }
        JsonNode profile = getJson(
                "https://graph.facebook.com/me?fields=id,name,email", accessToken);
        String fbId = profile.path("id").asText(null);
        String name = profile.path("name").asText("Swimmer");
        String email = profile.path("email").asText(null);
        return auth.findOrCreateOAuthUser(User.Provider.FACEBOOK, fbId, email, name);
    }

    // ---------- tiny HTTP helpers ----------

    private JsonNode postForm(String url, String form) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        return mapper.readTree(res.body());
    }

    private JsonNode getJson(String url, String bearer) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).header("Accept", "application/json");
        if (bearer != null) {
            b.header("Authorization", "Bearer " + bearer);
        }
        HttpResponse<String> res = http.send(b.GET().build(), HttpResponse.BodyHandlers.ofString());
        return mapper.readTree(res.body());
    }

    private void requireConfigured(String clientId, String provider) {
        if (clientId == null || clientId.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED,
                    provider + " login isn't configured yet — set app.oauth." + provider
                            + ".client-id / client-secret in application.properties");
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s == null ? "" : s, StandardCharsets.UTF_8);
    }

    public record AuthorizeUrl(String authorizeUrl, String state) {
    }
}
