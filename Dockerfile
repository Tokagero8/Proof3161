# syntax=docker/dockerfile:1

FROM eclipse-temurin:25-jdk-noble@sha256:7247bd8d2aeec64efe908dc72396d88101417d24ce3642703728382d96afb965 AS build

WORKDIR /workspace

COPY --chmod=0755 gradlew ./gradlew
COPY gradle ./gradle
COPY build.gradle.kts settings.gradle.kts ./
COPY src/main ./src/main

RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew --no-daemon bootJar \
    && mkdir -p /out \
    && cp build/libs/*.jar /out/app.jar


FROM eclipse-temurin:25-jre-noble@sha256:2ef7a81085e0502d7d4ff7e7c0257b6d4f46433f8ea6021180aa3c8a2b9ca3ec AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 proof3161 \
    && useradd \
        --system \
        --uid 10001 \
        --gid proof3161 \
        --home-dir /app \
        --no-create-home \
        --shell /usr/sbin/nologin \
        proof3161 \
    && mkdir -p /run/certificates

WORKDIR /app

COPY --from=build --chown=10001:10001 /out/app.jar ./app.jar

USER 10001:10001

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]