package org.example.gitvisualization.enums;

import io.github.biglv666.webcommon.result.ErrorCode;
import lombok.Getter;

@Getter
public enum CodeEnum implements ErrorCode {
     RUN_ERR(40000,"运行错误");


    private final int code;
    private final String message;

    CodeEnum(int i, String message) {
        this.code = i;
        this.message = message;
    }

    @Override
    public int getCode() {
        return code;
    }

    @Override
    public String getMessage() {
        return message;
    }
}
