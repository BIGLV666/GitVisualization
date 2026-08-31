package org.example.gitvisualization.services;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import io.github.biglv666.webcommon.exception.BusinessException;
import io.github.biglv666.webcommon.result.ResultCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.example.gitvisualization.dto.WarehouseDto;
import org.example.gitvisualization.entity.Warehouse;
import org.example.gitvisualization.enums.WarehouseStatus;
import org.example.gitvisualization.mapper.WarehouseMapper;
import org.example.gitvisualization.services.abstracts.WarehouseAbstract;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 仓库（Warehouse）增删改查业务服务。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class WarehouseService implements WarehouseAbstract {
    @Autowired
    private final WarehouseMapper warehouseMapper;

    /**
     * 查询仓库列表：排除已软删除的仓库，按创建时间倒序。
     */
    @Override
    public List<Warehouse> getWarehouses() {
        return warehouseMapper.selectList(new LambdaQueryWrapper<Warehouse>()
                .ne(Warehouse::getStatus, WarehouseStatus.DELETE)
                .orderByDesc(Warehouse::getCreateTime));
    }

    /**
     * 新增仓库：校验必填字段，补齐默认状态与时间后插入；
     * 命中 name 唯一索引则转换为“仓库名已存在”业务异常。
     */
    @Override
    public Warehouse createWarehouse(WarehouseDto dto) {
        validate(dto);
        Warehouse warehouse = new Warehouse(dto);
        warehouse.setStatus(WarehouseStatus.NORMAL);
        warehouse.setCreateTime(LocalDateTime.now());
        warehouse.setUpdateTime(LocalDateTime.now());
        try {
            warehouseMapper.insert(warehouse);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ResultCode.CONFLICT, "仓库名已存在");
        }
        return warehouse;
    }

    /**
     * 更新仓库：仅允许更新未删除的仓库，更新后刷新更新时间。
     */
    @Override
    public Warehouse updateWarehouse(Long id, WarehouseDto dto) {
        Warehouse warehouse = requireWarehouse(id);
        validate(dto);
        warehouse.setName(dto.getName());
        warehouse.setWarehousePath(dto.getWarehousePath());
        warehouse.setRemoteURL(dto.getRemoteURL());
        warehouse.setRemoteUsername(dto.getRemoteUsername());
        warehouse.setRemoteToken(dto.getRemoteToken());
        warehouse.setUpdateTime(LocalDateTime.now());
        try {
            warehouseMapper.updateById(warehouse);
        } catch (DuplicateKeyException e) {
            throw new BusinessException(ResultCode.CONFLICT, "仓库名已存在");
        }catch (Exception e){
            log.error("修改失败",e);
            throw e;
        }
        return warehouse;
    }

    /**
     * 删除仓库：物理删除（真删除），名称随之释放可复用。
     */
    @Override
    public void deleteWarehouse(Long id) {
        Warehouse warehouse = warehouseMapper.selectById(id);
        if (warehouse == null) {
            throw new BusinessException(ResultCode.NOT_FOUND, "仓库不存在");
        }
        warehouseMapper.deleteById(id);
    }

    /**
     * 按 id 查询并校验仓库存在（且未被删除），否则抛出业务异常。
     */
    private Warehouse requireWarehouse(Long id) {
        Warehouse warehouse = warehouseMapper.selectById(id);
        if (warehouse == null || warehouse.getStatus() == WarehouseStatus.DELETE) {
            throw new BusinessException(ResultCode.NOT_FOUND, "仓库不存在");
        }
        return warehouse;
    }

    /**
     * 校验仓库名称与本地路径不能为空。
     */
    private void validate(WarehouseDto dto) {
        if (dto == null || !StringUtils.hasText(dto.getName())) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "仓库名不能为空");
        }
        if (!StringUtils.hasText(dto.getWarehousePath())) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "仓库路径不能为空");
        }
        if (dto.getRemoteToken() != null && dto.getRemoteToken().length() > 1000) {
            throw new BusinessException(ResultCode.PARAM_ERROR, "访问令牌过长（最多 1000 字符）");
        }
    }
}
