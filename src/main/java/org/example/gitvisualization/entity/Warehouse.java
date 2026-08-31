package org.example.gitvisualization.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import org.example.gitvisualization.dto.WarehouseDto;
import org.example.gitvisualization.enums.WarehouseStatus;

import java.time.LocalDateTime;

@Data
@TableName(value = "warehouse")
public class Warehouse {
    @TableId(type = IdType.AUTO)
    private Long warehouseId;
    private String name;
    private String warehousePath;
    @TableField("remote_url")
    private String remoteURL;
    private WarehouseStatus status;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    public Warehouse() {}
    public Warehouse(WarehouseDto dto){
        this.name=dto.getName();
        this.warehousePath=dto.getWarehousePath();
        this.remoteURL=dto.getRemoteURL();
        this.updateTime=LocalDateTime.now();
    }
}
