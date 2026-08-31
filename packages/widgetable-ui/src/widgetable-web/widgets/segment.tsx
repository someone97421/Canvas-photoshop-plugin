import { Button, Flex, Segmented, Select, Typography } from 'antd';
import { useUIWeightCSS } from '../../utils';
import { BaseWidgetProps } from './_base';

export interface SegmentWidgetProps extends BaseWidgetProps {
    onSelectUpdate: (identify: string, index: number) => void;
    options: string[];
    value: string;
    name?: string;
    extraOptions?: Record<string, any>;
}

export const SegmentWidget: React.FC<SegmentWidgetProps> = ({
    onSelectUpdate,
    options,
    value,
    name,
    uiWeight
}) => {
    // 处理选择变化
    const handleSelect = (selectedValue: string) => {
        const selectedIndex = options.indexOf(selectedValue);
        onSelectUpdate(selectedValue, selectedIndex);
    };
    const uiWeightCSS = useUIWeightCSS(uiWeight || 12);

    return (
        <Flex
            style={{ width: '100%', ...uiWeightCSS }}
            align='center'
            gap={5}
        >
            {name && <span style={{ flex: 1, fontSize: 12, flexShrink: 0, minWidth: '60px' }}>{name}</span>}
            {options.map(option=> {
                return <Button size="small" type={option == value ? "primary" : "default"} key={option} onClick={()=> handleSelect(option)}>{option}</Button>
            })}
        </Flex>
    );
};


