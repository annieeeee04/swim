# --- Build stage ---
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Cache dependencies separately from source so code edits don't bust the Maven cache.
COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B package -DskipTests

# --- Run stage ---
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

RUN addgroup -S swim && adduser -S swim -G swim
COPY --from=build /app/target/*.jar app.jar

# H2 file database lives here; mount a volume to persist it across container restarts.
RUN mkdir -p /app/data && chown -R swim:swim /app
VOLUME ["/app/data"]
USER swim

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
