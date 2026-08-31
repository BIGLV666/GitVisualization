package org.example.gitvisualization.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;

public enum WarehouseStatus {
    /**
     * 正常
     */
    NORMAL(1),
    /**
     * 异常
     */
    ABNORMAL(2),
    /**
     * 删除
     */
    DELETE(3);

    /** 持久化到数据库、以及 JSON 序列化时都使用该 int 值 */
    @EnumValue
    private final int code;

    WarehouseStatus(int code) {
        this.code = code;
    }

    @JsonValue
    public int getCode() {
        return code;
    }
}
