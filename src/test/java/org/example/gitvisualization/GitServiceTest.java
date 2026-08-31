package org.example.gitvisualization;

import org.example.gitvisualization.entity.Warehouse;
import org.example.gitvisualization.mapper.WarehouseMapper;
import org.example.gitvisualization.services.GitService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.test.context.SpringBootTest;

import static org.mockito.Mockito.*;

@SpringBootTest
@ExtendWith(MockitoExtension.class)
public class GitServiceTest {
    @InjectMocks
    private  GitService gitService = new GitService();
    @Mock
    private  WarehouseMapper warehouseMapper;

    @Test
    public void getCommitsTest(){
        Warehouse warehouse =new Warehouse();
        warehouse.setWarehouseId(1L);
        warehouse.setWarehousePath("E:\\learncard\\CodeWise");
        when(warehouseMapper.selectById(1L)).thenReturn(warehouse);

        var list=gitService.getCommits(1L, 200);
        System.out.println(list);

    }

}
