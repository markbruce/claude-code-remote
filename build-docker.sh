#!/bin/bash
# CC-Remote Docker 构建脚本

set -e

IMAGE_NAME="cc-remote-server"
IMAGE_TAG="${1:-latest}"
OUTPUT_FILE="cc-remote-server-${IMAGE_TAG}.tar"

echo "=========================================="
echo "  CC-Remote Docker 构建脚本"
echo "=========================================="
echo ""
echo "镜像名称: ${IMAGE_NAME}:${IMAGE_TAG}"
echo "输出文件: ${OUTPUT_FILE}"
echo ""

# 切换到项目根目录
cd "$(dirname "$0")"

echo "[1/3] 构建 Docker 镜像..."
docker build \
  -f packages/server/Dockerfile \
  -t ${IMAGE_NAME}:${IMAGE_TAG} \
  --build-arg NODE_ENV=production \
  .

echo ""
echo "[2/3] 导出镜像到文件..."
docker save -o ${OUTPUT_FILE} ${IMAGE_NAME}:${IMAGE_TAG}

echo ""
echo "[3/3] 压缩镜像文件..."
gzip -f ${OUTPUT_FILE}

echo ""
echo "=========================================="
echo "  构建完成!"
echo "=========================================="
echo ""
echo "输出文件: ${OUTPUT_FILE}.gz"
echo "文件大小: $(ls -lh ${OUTPUT_FILE}.gz | awk '{print $5}')"
echo ""
echo "使用方法:"
echo "  1. 上传 ${OUTPUT_FILE}.gz 到目标机器"
echo "  2. 加载镜像: gunzip -c ${OUTPUT_FILE}.gz | docker load"
echo "  3. 运行容器: docker run -d -p 3000:3000 -v cc-remote-data:/app/data ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
