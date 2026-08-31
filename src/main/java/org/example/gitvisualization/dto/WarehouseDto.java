package org.example.gitvisualization.dto;

import lombok.Data;
import org.example.gitvisualization.enums.WarehouseStatus;

@Data
public class WarehouseDto {
    private String name;
    private String warehousePath;
    private String remoteURL;
}
