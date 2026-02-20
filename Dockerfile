FROM node:20-slim

WORKDIR /app

# Dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependências npm primeiro (melhor camada de cache)
COPY package*.json ./
RUN npm install --production

# Instalar Claude Code CLI via npm
RUN npm install -g @anthropic-ai/claude-code

# Instalar Opencode CLI
RUN curl -fsSL https://opencode.ai/install | bash

COPY . .

# Criar usuário não-root (Claude Code recusa bypassPermissions como root)
RUN useradd -m -s /bin/bash claw && chown -R claw:claw /app

# Configurar paths e workspace para o usuário não-root
ENV PATH="/home/claw/.opencode/bin:/home/claw/.local/bin:${PATH}"
ENV HOME=/home/claw

# Mover CLI opencode para o novo usuário
RUN cp -r /root/.opencode /home/claw/.opencode 2>/dev/null || true && \
    chown -R claw:claw /home/claw

# Criar workspace e configurações do Claude como usuário não-root
USER claw
RUN mkdir -p /home/claw/openclawd/memory && \
    mkdir -p /home/claw/.claude && \
    echo '{}' > /home/claw/.claude/statsig_metadata.json && \
    echo '{"hasCompletedOnboarding":true}' > /home/claw/.claude/settings.json

EXPOSE 4096

CMD ["node", "gateway.js"]
