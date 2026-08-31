CREATE DATABASE IF NOT EXISTS git_visualization
    DEFAULT CHARACTER SET utf8mb4;
USE git_visualization;

CREATE TABLE IF NOT EXISTS warehouse (
    warehouse_id   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '仓库ID',
    name           VARCHAR(255) NOT NULL COMMENT '仓库名称',
    warehouse_path VARCHAR(255) not NULL COMMENT '本地仓库路径',
    remote_url     VARCHAR(255) NULL COMMENT '远程仓库URL',
    remote_username VARCHAR(255) NULL COMMENT '远程仓库用户名',
    remote_token    VARCHAR(255) NULL COMMENT '远程仓库访问令牌(Token)',
    status         TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1-正常 2-异常 3-删除',
    create_time    DATETIME     NULL COMMENT '创建时间',
    update_time    DATETIME     NULL COMMENT '更新时间',
    PRIMARY KEY (warehouse_id),
    UNIQUE KEY uk_warehouse_name (name)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '仓库表';
